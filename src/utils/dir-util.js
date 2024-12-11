import {objectifyArgs, arrayify} from "./js-util.js";
import path from "path-browserify";
import {minimatch} from "minimatch";

export function minimatchAny(fn, patterns, options={}) {
	patterns=arrayify(patterns);

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

export async function dirForEach(...params) {
	let {dir, subDir, cb, patterns, ignore, fs}=objectifyArgs(params,["dir","cb"]);

	if (!dir)
		throw new Error("dir missing");

	if (!subDir)
		subDir="";

	patterns=arrayify(patterns);

	let files=await fs.promises.readdir(path.join(dir,subDir));
	for (let fn of files) {
		let resolvedName=path.join(subDir,fn);
		if (!minimatchAny(resolvedName,ignore)) {
			let fullName=path.join(dir,subDir,fn);
			let stat=await fs.promises.stat(fullName);
			stat.name=resolvedName;

			if (!patterns.length || minimatchAny(resolvedName,patterns)) {
				await cb(stat);
			}

			if (stat.isDirectory()) {
				if (!patterns.length || minimatchAny(resolvedName,patterns,{partial: true})) {
					await dirForEach({dir,cb,patterns,ignore,fs,
						subDir: resolvedName
					});
				}
			}
		}
	}
}

export async function findFiles(...params) {
	let res=[];

	await dirForEach(...params,{cb: stat=>{
		if (stat.isFile())
			res.push(stat.name);
	}});

	return res;
}

export function dirForEachSync(...params) {
	let {dir, subDir, cb, patterns, ignore, fs}=objectifyArgs(params,["dir","cb"]);

	if (!dir)
		throw new Error("dir missing");

	if (!subDir)
		subDir="";

	patterns=arrayify(patterns);

	let files=fs.readdirSync(path.join(dir,subDir));
	for (let fn of files) {
		let resolvedName=path.join(subDir,fn);
		if (!minimatchAny(resolvedName,ignore)) {
			let fullName=path.join(dir,subDir,fn);
			let stat=fs.statSync(fullName);
			stat.name=resolvedName;

			if (!patterns.length || minimatchAny(resolvedName,patterns)) {
				cb(stat);
			}

			if (stat.isDirectory()) {
				if (!patterns.length || minimatchAny(resolvedName,patterns,{partial: true})) {
					dirForEachSync({dir,cb,patterns,ignore,fs,
						subDir: resolvedName
					});
				}
			}
		}
	}
}

export function findFilesSync(...params) {
	let res=[];

	dirForEachSync(...params,{cb: stat=>{
		if (stat.isFile())
			res.push(stat.name);
	}});

	return res;
}
