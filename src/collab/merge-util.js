import {diff3Merge} from 'node-diff3';
import {arrayUnique, arrayDifference, arrayIntersection} from "../utils/js-util.js";
import {getFileHash, mkdirParent} from "../utils/fs-util.js";
import {findFiles, minimatchAny} from "../utils/dir-util.js";
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

export async function getDiffState({local, ancestor, remote, name, fs}) {
	let fileState=
		(fs.existsSync(path.join(local,name))?"l":"-")+
		(fs.existsSync(path.join(ancestor,name))?"a":"-")+
		(fs.existsSync(path.join(remote,name))?"r":"-");

	let diffState={
		name: name,
		state: fileState
	};

	if (fs.existsSync(path.join(local,name)))
		diffState.localHash=await getFileHash(path.join(local,name),{fs:fs});

	if (fs.existsSync(path.join(ancestor,name)))
		diffState.ancestorHash=await getFileHash(path.join(ancestor,name),{fs:fs});

	if (fs.existsSync(path.join(remote,name)))
		diffState.remoteHash=await getFileHash(path.join(remote,name),{fs:fs});

	switch (fileState) {
		// Remote create.
		case "--r":
			diffState.remote="new";
			break;

		// Local create.
		case "l--":
			diffState.local="new";
			break;

		// Deleted remote and local.
		case "-a-":
			diffState.local="delete";
			diffState.remote="delete";
			break;

		// Local delete.
		case "-ar":
			diffState.local="delete";
			break;

		// Remote delete.
		case "la-":
			diffState.remote="delete";
			break;

		// Created in both places.
		case "l-r":
			diffState.local="new";
			diffState.remote="new";
			break;

		// Exists everywhere.
		case "lar":
			if (diffState.localHash!=diffState.ancestorHash)
				diffState.local="change";

			if (diffState.remoteHash!=diffState.ancestorHash)
				diffState.remote="change";

			break;

		default:
			throw new Error("Unknown file state");
	}

	return diffState;
}

export async function diffFileTrees({local, ancestor, remote, ignore, fs}) {
	//console.log("diff file trees");
	let localNames=await findFiles(local,{ignore, fs});
	let remoteNames=await findFiles(remote,{ignore, fs});
	let ancestorNames=await findFiles(ancestor,{ignore, fs});
	//console.log("read files...");

	let allNames=arrayUnique([
		...localNames,
		...remoteNames,
		...ancestorNames,
	]);

	let res=[];
	for (let name of allNames)
		res.push(await getDiffState({local, ancestor, remote, name, fs}));

	return res;
}

// After the op, local=merged, ancestor=remote
export async function mergeFileTrees({local, ancestor, remote, resolve, ignore, fs, binPatterns, log}) {
	if (!log)
		log=()=>{};

	async function mergeFile(name) {
		if (minimatchAny(name,binPatterns)) {
			//console.log("bin: "+name);
			await mergeBinFile({local, ancestor, remote, resolve, name, fs});
		}

		else {
			//console.log("text: "+name);
			await mergeTextFile({local, ancestor, remote, resolve, name, fs});
		}
	}

	let diffStates=await diffFileTrees({local, ancestor, remote, ignore, fs});
	for (let diffState of diffStates) {
		let name=diffState.name;
		//console.log("merge file: "+name);

		switch (diffState.state) {

			// Remote create.
			case "--r":
				log("New remote: "+name);

				await mkdirParent(path.join(ancestor,name),{fs:fs});
				await fs.promises.cp(path.join(remote,name),path.join(ancestor,name));

				await mkdirParent(path.join(local,name),{fs:fs});
				await fs.promises.cp(path.join(remote,name),path.join(local,name));
				break;

			// Local create.
			case "l--":
				break;

			// Deleted remote and local.
			case "-a-":
				log("Delete: "+name);

				await fs.promises.rm(path.join(ancestor,name));
				break;

			// Local delete.
			case "-ar":
				break;

			// Remote delete.
			case "la-":
				log("Delete: "+name);

				await fs.promises.rm(path.join(local,name));
				await fs.promises.rm(path.join(ancestor,name));
				break;

			// Created in both places.
			case "l-r":
				log("New: "+name);

				switch (resolve) {
					case "local":
						await mkdirParent(path.join(ancestor,name),{fs:fs});
						await fs.promises.cp(path.join(remote,name),path.join(ancestor,name));
						break;

					case "remote":
						await mkdirParent(path.join(ancestor,name),{fs:fs});
						await fs.promises.cp(path.join(remote,name),path.join(ancestor,name));

						await mkdirParent(path.join(local,name),{fs:fs});
						await fs.promises.cp(path.join(remote,name),path.join(local,name));
						break;

					default:
						throw new Error("Merge conflict: "+name);
				}
				break;

			// Exists everywhere.
			case "lar":
				if (diffState.local || diffState.remote) {
					log("Merge: "+name);
					await mergeFile(name);
				}

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
