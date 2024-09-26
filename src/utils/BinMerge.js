import {arrayUnique} from '../utils/js-util.js';

export default class BinMerge {
	constructor({localFiles, remoteFiles, baseFiles}) {
		this.localFiles=localFiles;
		this.remoteFiles=remoteFiles;
		this.baseFiles=baseFiles;
	}

	getStatusString({resolve, includeLocal}={}) {
		if (includeLocal===undefined)
			includeLocal=true;

		let opCount=this.getMergeOpCount({resolve});
		let summaryItems=[];
		if (opCount.upload && includeLocal)
			summaryItems.push(opCount.upload+" upload")

		if (opCount.download)
			summaryItems.push(opCount.download+" download")

		if (opCount.delete)
			summaryItems.push(opCount.delete+" delete")

		if (!summaryItems.length)
			return "No Content Changes.";

		return ("Content Changes: "+summaryItems.join(", ")+".");
	}

	getMergeOpCount({resolve}={}) {
		let opCount={
			upload: 0,
			download: 0,
			delete: 0
		};

		let ops=this.getMergeOps({resolve});
		for (let k in ops)
			opCount[ops[k]]++;

		return opCount;
	}

	getMergeOps({resolve}={}) {
		let ops={};
		let fileNames=arrayUnique([
			...Object.keys(this.localFiles),
			...Object.keys(this.remoteFiles),
			...Object.keys(this.baseFiles),
		]);

		for (let fileName of fileNames) {
			if (this.baseFiles[fileName]) {
				if (!this.localFiles[fileName] ||
						!this.remoteFiles[fileName]) {
					ops[fileName]="delete";
				}

				else if (this.localFiles[fileName]!=this.baseFiles[fileName].local &&
						this.remoteFiles[fileName]!=this.baseFiles[fileName].remote) {
					switch (resolve) {
						case "ours":
							ops[fileName]="upload";
							break;

						case "theirs":
							ops[fileName]="download";
							break;

						default:
							throw new Error("Conflict");
							break;
					}
				}

				else if (this.localFiles[fileName]!=this.baseFiles[fileName].local) {
					ops[fileName]="upload";
				}

				else if (this.remoteFiles[fileName]!=this.baseFiles[fileName].remote) {
					ops[fileName]="download";
				}
			}

			else {
				if (this.localFiles[fileName] && 
						this.remoteFiles[fileName]) {
					switch (resolve) {
						case "ours":
							ops[fileName]="upload";
							break;

						case "theirs":
							ops[fileName]="download";
							break;

						default:
							throw new Error("Conflict");
							break;
					}
				}

				else if (this.localFiles[fileName]) {
					ops[fileName]="upload";
				}

				else if (this.remoteFiles[fileName]) {
					ops[fileName]="download";
				}

				else throw new Error("Shouldn't happen");
			}
		}

		return ops;
	}
}