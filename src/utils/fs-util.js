import path from "path";
import {arrayDifference} from "./js-util.js";

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

export async function getFileHash(fn,{fs}) {
	let hashBuffer=await crypto.subtle.digest("SHA-256",await fs.promises.readFile(fn));

	return Array.from(
	    new Uint8Array(hashBuffer),
	    (byte) => byte.toString(16).padStart(2, '0')
	).join('');
}

export async function downloadFile(url, fn, {fs}) {
	let response=await fetch(url);
	if (response.status<200 || response.status>=300)
		throw new Error("Fetch failed: "+response.status);

	await fs.promises.writeFile(fn,new Uint8Array(await response.arrayBuffer()));
}