import path from "path-browserify";

export async function getFileObject(fn,{fs}) {
	let name=path.basename(fn);
	let data=await fs.promises.readFile(fn);
	let file=new File([data],name);
	return file;
}

export async function getFileHash(fn,{fs}) {
	let hashBuffer=await crypto.subtle.digest("SHA-256",await fs.promises.readFile(fn));

	return Array.from(
	    new Uint8Array(hashBuffer),
	    (byte) => byte.toString(16).padStart(2, '0')
	).join('');
}

export async function getStringHash(s) {
	let enc=new TextEncoder();
	let hashBuffer=await crypto.subtle.digest("SHA-256",enc.encode(s));

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
