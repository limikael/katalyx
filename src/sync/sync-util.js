import {diff3Merge} from 'node-diff3';
import {arrayDifference, arrayIntersection} from "../utils/js-util.js";

export function	diffFileTree(cand, ancestor) {
	let newNames=arrayDifference(Object.keys(cand),Object.keys(ancestor));
	let deletedNames=arrayDifference(Object.keys(ancestor),Object.keys(cand));
	let commonNames=arrayIntersection(Object.keys(cand),Object.keys(ancestor));

	let res={}
	for (let deletedName of deletedNames)
		res[deletedName]="delete";

	for (let newName of newNames)
		res[newName]="new";

	let changedNames=[];
	for (let commonName of commonNames)
		if (cand[commonName]!=ancestor[commonName])
			res[commonName]="change";

	return res;
}

export function simpleTextMerge(local, ancestor, remote, {resolve}={}) {
	if (typeof local!="string")
		throw new Error("local is not string");

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
