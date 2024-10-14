import {arrayUnique} from "../utils/js-util.js";
import {simpleTextMerge} from "./sync-util.js";

export default class MergeFiles {
	constructor({resolve}={}) {
		this.resolve=resolve;
	}

	merge=({local, remote, ancestor, resolve})=>{
		if (!resolve)
			resolve=this.resolve;

		let allNames=arrayUnique([
			...Object.keys(local),
			...Object.keys(remote),
			...Object.keys(ancestor)
		]);

		let result={};

		for (let name of allNames) {
			let fileState=
				(local.hasOwnProperty(name)?"l":"-")+
				(ancestor.hasOwnProperty(name)?"a":"-")+
				(remote.hasOwnProperty(name)?"r":"-");

			switch (fileState) {

				// Remote create.
				case "--r":
					result[name]=remote[name];
					break;

				// Local create.
				case "l--":
					result[name]=local[name];
					break;

				// Deleted.
				case "-a-":
				case "-ar":
				case "la-":
					break;

				// Created in both places.
				case "l-r":
					switch (resolve) {
						case "local":
							result[name]=local[name];
							break;

						case "remote":
							result[name]=remote[name];
							break;

						default:
							throw new Error("Merge conflict: "+name);
					}
					break;

				// Exists everywhere.
				case "lar":
					result[name]=simpleTextMerge(local[name],ancestor[name],remote[name],{resolve});
					break;

				default:
					throw new Error("Unknown file state");
			}
		}

		return result;
	}
}