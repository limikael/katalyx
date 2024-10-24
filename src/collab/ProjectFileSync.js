import RemoteProject from "./RemoteProject.js";
import path from "path-browserify";
import {mergeFileTrees, getChangedFiles} from "./merge-util.js";

export default class ProjectFileSync {
	constructor({fs, rpc, qm, project_id, cwd, ignore, contentUrl, version}) {
		this.fs=fs;
		this.rpc=rpc;
		this.project_id=project_id;
		this.cwd=cwd;
		this.ignore=ignore;
		this.version=version;
		this.contentUrl=contentUrl;
		this.qm=qm;

		this.binaryExtensions=[".jpg",".png",".gif"];

		//console.log("init file sync, version="+this.version);

		this.remoteProject=new RemoteProject({
			fs: this.fs,
			qm: this.qm,
			rpc: this.rpc,
			project_id: this.project_id,
			remoteCwd: path.join(this.cwd,".katalyx/remote"),
			contentUrl: this.contentUrl,
			ignore: this.ignore
		});
	}

	async pushFile(fn) {
		let bin;
		for (let ext of this.binaryExtensions)
			if (fn.endsWith(ext))
				bin=true;

		if (bin) {
			let pushResult=await this.remoteProject.pushBinFile(fn,path.join(this.cwd,fn));
			if (pushResult) {
				await this.fs.promises.cp(
					path.join(this.cwd,fn),
					path.join(this.cwd,".katalyx/ancestor",fn)
				);
			}

			return pushResult;
		}

		else {
			let content=await this.fs.promises.readFile(path.join(this.cwd,fn),"utf8");
			let pushResult=await this.remoteProject.pushFile(fn,content);

			if (pushResult)
				await this.fs.promises.writeFile(path.join(this.cwd,".katalyx/ancestor",fn),content);

			return pushResult;
		}
	}

	async sync({pull, push}={}) {
		//console.log("syncing files");
		//let ignore=["node_modules",".target",".tmp",".katalyx","**/*.js.bundle","public/*.css","public/*.js"];
		//let ignore=["node_modules",".target",".tmp",".katalyx","**/*.js.bundle"];

		await this.fs.promises.mkdir(path.join(this.cwd,".katalyx/ancestor"),{recursive: true});

		do {
			if (pull || this.needPull) {
				//console.log("pulling...");
				await this.remoteProject.pull();

				//console.log("merging...");
				await mergeFileTrees({
					local: this.cwd,
					ancestor: path.join(this.cwd,".katalyx/ancestor"),
					remote: path.join(this.cwd,".katalyx/remote"),
					resolve: "remote",
					ignore: this.ignore,
					fs: this.fs,
					strategies: {
						".jpg": "bin",
						".png": "bin",
						".gif": "bin"
					}
				});

				this.needPull=false;
			}

			if (push) {
				//console.log("pushing...");
				let changes=await getChangedFiles({
					source: path.join(this.cwd,".katalyx/remote"),
					target: this.cwd,
					fs: this.fs,
					ignore: this.ignore
				});

				if (changes.changed.length ||
						changes.delete.length ||
						changes.new.length) {
					for (let pushFn of [...changes.new,...changes.changed]) {
						if (!await this.pushFile(pushFn)) {
							console.log("need to pull again");
							this.needPull=true;
						}
					}

					for (let deleteFn of changes.delete) {
						await this.remoteProject.deleteFile(deleteFn);
						await this.fs.promises.rm(path.join(this.cwd,".katalyx/ancestor",deleteFn));
					}

					if (!this.needPull) {
						this.version=await this.rpc.incProjectVersion({project_id: this.project_id});
						console.log("pushed version: "+this.version);
					}
				}
			}
		} while (this.needPull);

		//console.log(changes);
	}
}