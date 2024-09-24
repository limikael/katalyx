import path from "path";
import {minimatch} from "minimatch";
import {arrayDifference} from "./js-util.js";

function minimatchAny(fn, patterns, options={}) {
	if (!patterns)
		return false;

	for (let pattern of patterns) {
		if (options.baseDir)
			pattern=path.resolve(options.baseDir,pattern);

		if (minimatch(fn,pattern,options))
			return true;
	}

	return false;
}

export async function findMatchingFiles(baseDir, patterns, {subDir, fs}) {
	let res=[];

	if (!subDir)
		subDir="";

	if (!path.isAbsolute(baseDir))
		throw new Error("Not absolute: "+baseDir);

	let scanDir=path.resolve(baseDir,subDir);
	for (let sub of await fs.promises.readdir(scanDir)) {
		let resolvedSub=path.resolve(scanDir,sub);
		let stat=await fs.promises.stat(resolvedSub)

		if (stat.isDirectory()) {
			if (minimatchAny(resolvedSub,patterns,{
					baseDir:baseDir,
					partial:true}))
				res.push(...await findMatchingFiles(baseDir,patterns,{
					subDir: path.join(subDir,sub),
					fs: fs
				}));
		}

		else {
			if (minimatchAny(resolvedSub,patterns,{baseDir:baseDir}))
				res.push(path.join(subDir,sub));
		}
	}

	return res;
}

export function getFileOps(current, wanted) {
	let res={};

	for (let fn of arrayDifference(Object.keys(current),Object.keys(wanted))) {
		res[fn]=undefined;
	}

	for (let fn of Object.keys(wanted)) {
		if (current[fn]!=wanted[fn])
			res[fn]=wanted[fn];
	}

	return res;
}