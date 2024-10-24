import {diff3Merge} from 'node-diff3';
import {arrayUnique, arrayDifference, arrayIntersection} from "../utils/js-util.js";
import {getFileHash} from "../utils/fs-util.js";
import {findFiles} from "../utils/dir-util.js";
import path from "path-browserify";

export async function getChangedFiles({source, target, ignore, fs}) {
	let sourceNames=await findFiles(source,{ignore, fs});
	let targetNames=await findFiles(target,{ignore, fs});

	let res={
		delete: arrayDifference(sourceNames,targetNames),
		new: arrayDifference(targetNames,sourceNames),
		changed: []
	};

	for (let fn of arrayIntersection(sourceNames,targetNames)) {
		let sourceHash=await getFileHash(path.join(source,fn),{fs});
		let targetHash=await getFileHash(path.join(target,fn),{fs});
		if (sourceHash!=targetHash)
			res.changed.push(fn);
	}

	return res;
}

export async function getFileTreeChanges({local, ancestor, remote, ignore, fs}) {
	let localNames=await findFiles(local,{ignore, fs});
	let remoteNames=await findFiles(remote,{ignore, fs});
	let ancestorNames=await findFiles(ancestor,{ignore, fs});

	//console.log("ignore",ignore);
	//console.log(remoteNames);

	let allNames=arrayUnique([
		...localNames,
		...remoteNames,
		...ancestorNames,
	]);

	let res=[];
	for (let name of allNames) {
		let change=await getFileChange({local, ancestor, remote, name, fs});
		if (change) {
			res.push({
				name: name,
				...change
			});
		}
	}

	return res;
}

export async function getFileChange({local, ancestor, remote, name, fs}) {
	let fileState=
		(fs.existsSync(path.join(local,name))?"l":"-")+
		(fs.existsSync(path.join(ancestor,name))?"a":"-")+
		(fs.existsSync(path.join(remote,name))?"r":"-");

	switch (fileState) {
		// Remote create.
		case "--r":
			return ({remote: "new"});
			break;

		// Local create.
		case "l--":
			return ({local: "new"});
			break;

		// Deleted remote and local.
		case "-a-":
			return ({local: "delete", remote: "delete"});
			break;

		// Local delete.
		case "-ar":
			return ({local: "delete"});
			break;

		// Remote delete.
		case "la-":
			return ({remote: "delete"});
			break;

		// Created in both places.
		case "l-r":
			return ({remote: "new", local: "new"});
			break;

		// Exists everywhere.
		case "lar":
			let localHash=await getFileHash(path.join(local,name),{fs:fs});
			let ancestorHash=await getFileHash(path.join(ancestor,name),{fs:fs});
			let remoteHash=await getFileHash(path.join(remote,name),{fs:fs});

			if (localHash==ancestorHash &&
					remoteHash==ancestorHash)
				return;

			let res={};
			if (localHash!=ancestorHash)
				res.local="change";

			if (remoteHash!=ancestorHash)
				res.remote="change";

			return res;
			break;

		default:
			throw new Error("Unknown file state");
	}
}

export async function diffFileTrees({local, ancestor, remote, ignore, fs}) {
	let localNames=await findFiles(local,{ignore, fs});
	let remoteNames=await findFiles(remote,{ignore, fs});
	let ancestorNames=await findFiles(ancestor,{ignore, fs});

	//console.log("ignore",ignore);
	//console.log(remoteNames);

	let allNames=arrayUnique([
		...localNames,
		...remoteNames,
		...ancestorNames,
	]);

	let res=[];
	for (let name of allNames) {
		let fileState=
			(fs.existsSync(path.join(local,name))?"l":"-")+
			(fs.existsSync(path.join(ancestor,name))?"a":"-")+
			(fs.existsSync(path.join(remote,name))?"r":"-");

		res.push({
			name: name,
			state: fileState
		});
	}

	return res;
}

async function copyWithMkdir(from, to, {fs}) {
	if (!fs.existsSync(path.dirname(to)))
		await fs.promises.mkdir(path.dirname(to));

	await fs.promises.cp(from,to);
}

// After the op, local=merged, ancestor=remote
export async function mergeFileTrees({local, ancestor, remote, resolve, ignore, fs, strategies}) {
	if (!strategies)
		strategies={};

	async function mergeFile(name) {
		let strategy="text";
		for (let k in strategies)
			if (name.endsWith(k))
				strategy=strategies[k];

		switch (strategy) {
			case "text":
				await mergeTextFile({local, ancestor, remote, resolve, name, fs});
				break;

			case "bin":
				await mergeBinFile({local, ancestor, remote, resolve, name, fs});
				break;

			default:
				throw new Error("unknown merge strategy: "+strategy);
		}
	}

	let fileStates=await diffFileTrees({local, ancestor, remote, ignore, fs});
	for (let fileState of fileStates) {
		let name=fileState.name;
		//console.log("merge file: "+name);

		switch (fileState.state) {

			// Remote create.
			case "--r":
				await copyWithMkdir(path.join(remote,name),path.join(ancestor,name),{fs});
				await copyWithMkdir(path.join(remote,name),path.join(local,name),{fs});
				break;

			// Local create.
			case "l--":
				break;

			// Deleted remote and local.
			case "-a-":
				await fs.promises.rm(path.join(ancestor,name));
				break;

			// Local delete.
			case "-ar":
				break;

			// Remote delete.
			case "la-":
				await fs.promises.rm(path.join(local,name));
				await fs.promises.rm(path.join(ancestor,name));
				break;

			// Created in both places.
			case "l-r":
				switch (resolve) {
					case "local":
						await copyWithMkdir(path.join(remote,name),path.join(ancestor,name),{fs});
						break;

					case "remote":
						await copyWithMkdir(path.join(remote,name),path.join(ancestor,name),{fs});
						await copyWithMkdir(path.join(remote,name),path.join(local,name),{fs});
						break;

					default:
						throw new Error("Merge conflict: "+name);
				}
				break;

			// Exists everywhere.
			case "lar":
				await mergeFile(name);
				break;

			default:
				throw new Error("Unknown file state");
		}
	}
}

export async function mergeBinFile({local, ancestor, remote, resolve, name, fs}) {
	let localHash=await getFileHash(path.join(local,name),{fs:fs});
	let ancestorHash=await getFileHash(path.join(ancestor,name),{fs:fs});
	let remoteHash=await getFileHash(path.join(remote,name),{fs:fs});

	if (localHash==ancestorHash &&
			remoteHash==ancestorHash)
		return;

	if (localHash!=ancestorHash &&
			remoteHash!=ancestorHash) {
		switch (resolve) {
			case "local":
				await fs.promises.cp(path.join(remote,name),path.join(ancestor,name));
				break;

			case "remote":
				await fs.promises.cp(path.join(remote,name),path.join(local,name));
				await fs.promises.cp(path.join(remote,name),path.join(ancestor,name));
				break;

			default:
				throw new Error("Merge conflict: "+name);
		}

		return;
	}

	if (remoteHash!=ancestorHash) {
		await fs.promises.cp(path.join(remote,name),path.join(local,name));
		await fs.promises.cp(path.join(remote,name),path.join(ancestor,name));
		return;
	}

	// if the local is changed, just leave it...
}

async function mergeTextFile({local, ancestor, remote, resolve, name, fs}) {
	let ancestorContent=await fs.promises.readFile(path.join(ancestor,name),"utf8");
	let remoteContent=await fs.promises.readFile(path.join(remote,name),"utf8");
	let localContent=fs.readFileSync(path.join(local,name),"utf8");

	let mergedContent=simpleTextMerge({
		local: localContent,
		ancestor: ancestorContent,
		remote: remoteContent,
		resolve: resolve
	});

	if (mergedContent!=localContent)
		fs.writeFileSync(path.join(local,name),mergedContent);

	if (remoteContent!=ancestorContent)
		await fs.promises.writeFile(path.join(ancestor,name),remoteContent);
}

export function simpleTextMerge({local, ancestor, remote, resolve}={}) {
	if (typeof local!="string")
		throw new Error("local is not string: "+local);

	if (typeof ancestor!="string")
		throw new Error("ancestor is not string");

	if (typeof remote!="string")
		throw new Error("remote is not string");

	let mergeEntries=diff3Merge(local,ancestor,remote,{
		stringSeparator: "\n"
	});
	//console.log(mergeEntries);

	let mergedArray=[];
	for (let mergeEntry of mergeEntries) {
		if (mergeEntry.ok) {
			mergedArray.push(...mergeEntry.ok)
		}

		else if (mergeEntry.conflict) {
			switch (resolve) {
				case "local":
					mergedArray.push(...mergeEntry.conflict.a);
					break;

				case "remote":
					mergedArray.push(...mergeEntry.conflict.b);
					break;

				default:
					throw new Error("Merge conflict.");
			}
		}

		else throw new Error("Not merge entry?");
	}

	return mergedArray.join("\n");
}
