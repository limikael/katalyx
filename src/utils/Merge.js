import {arrayDifference, arrayIntersection, arrayUnique} from "../utils/js-util.js";
import {diff3Merge} from 'node-diff3'; 

export default class Merge {
	constructor({originalFiles, ourFiles, theirFiles}) {
		this.originalFiles=originalFiles;
		this.ourFiles=ourFiles;
		this.theirFiles=theirFiles;
	}

	merge({resolve}={}) {
		let mergedFiles=structuredClone(this.originalFiles);
		let ourChanges=this.getOurChanges();
		let theirChanges=this.getTheirChanges();

		for (let fn of ourChanges.deleted)
			delete mergedFiles[fn];

		for (let fn of theirChanges.deleted)
			delete mergedFiles[fn];

		let mergeFileNames=arrayUnique([
			...ourChanges.new,...ourChanges.changed,
			...theirChanges.new,...theirChanges.changed,
		]);

		mergeFileNames=arrayDifference(mergeFileNames,ourChanges.deleted);
		mergeFileNames=arrayDifference(mergeFileNames,theirChanges.deleted);

		for (let fn of mergeFileNames) {
			if (this.ourFiles.hasOwnProperty(fn) &&
					this.originalFiles.hasOwnProperty(fn) &&
					this.theirFiles.hasOwnProperty(fn)) {
				let mergedArray=[];
				let mergeEntries=diff3Merge(this.ourFiles[fn],this.originalFiles[fn],this.theirFiles[fn],{
					stringSeparator: "\n"
				});
				//console.log(mergeEntries);

				for (let mergeEntry of mergeEntries) {
					if (mergeEntry.ok) {
						mergedArray.push(...mergeEntry.ok)
					}

					else if (mergeEntry.conflict) {
						switch (resolve) {
							case "ours":
								mergedArray.push(...mergeEntry.conflict.a);
								break;

							case "theirs":
								mergedArray.push(...mergeEntry.conflict.b);
								break;

							default:
								throw new Error("Merge conflict.");
						}
					}

					else throw new Error("Not merge entry?");
				}

				mergedFiles[fn]=mergedArray.join("\n");
			}

			else if (this.ourFiles.hasOwnProperty(fn) &&
					this.theirFiles.hasOwnProperty(fn)) {
				switch (resolve) {
					case "ours":
						mergedFiles[fn]=this.ourFiles[fn];
						break;

					case "theirs":
						mergedFiles[fn]=this.theirFiles[fn];
						break;

					default:
						throw new Error("Merge conflict.");
				}
			}

			else if (this.ourFiles.hasOwnProperty(fn)) {
				mergedFiles[fn]=this.ourFiles[fn];
			}

			else if (this.theirFiles.hasOwnProperty(fn)) {
				mergedFiles[fn]=this.theirFiles[fn];
			}

			else throw new Error("Shouldn't happen");
		}

		//console.log(mergeFileNames);
		return mergedFiles;
	}

	getChanges(fileSet) {
		let newNames=arrayDifference(Object.keys(fileSet),Object.keys(this.originalFiles));
		let deletedNames=arrayDifference(Object.keys(this.originalFiles),Object.keys(fileSet));
		let commonNames=arrayIntersection(Object.keys(this.originalFiles),Object.keys(fileSet));

		let changedNames=[];
		for (let commonName of commonNames)
			if (this.originalFiles[commonName]!=fileSet[commonName]) {
				//console.log(this.originalFiles[commonName])
				//console.log(fileSet[commonName])
				changedNames.push(commonName);
			}

		return ({
			new: newNames,
			deleted: deletedNames,
			changed: changedNames,
			numTotal: newNames.length+deletedNames.length+changedNames.length
		});
	}

	isUpToDate() {
		return (
			(this.getOurChanges().numTotal==0) &&			
			(this.getTheirChanges().numTotal==0)
		);
	}

	getOurChanges() {
		return this.getChanges(this.ourFiles);
	}

	getTheirChanges() {
		return this.getChanges(this.theirFiles);
	}
}