import RemoteProject from "./RemoteProject.js";
import path from "path-browserify";
import {mergeFileTrees, getChangedFiles} from "./merge-util.js";
import {mkdirParent} from "../utils/fs-util.js";

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
				await mkdirParent(path.join(this.cwd,".katalyx/ancestor",fn),{fs: this.fs});
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

			if (pushResult) {
				await mkdirParent(path.join(this.cwd,".katalyx/ancestor",fn),{fs: this.fs});
				await this.fs.promises.writeFile(path.join(this.cwd,".katalyx/ancestor",fn),content);
			}

			return pushResult;
		}
	}

	async sync({pull, push, log}={}) {
		//console.log("syncing files");
		//let ignore=["node_modules",".target",".tmp",".katalyx","**/*.js.bundle","public/*.css","public/*.js"];
		//let ignore=["node_modules",".target",".tmp",".katalyx","**/*.js.bundle"];

		if (!log)
			log=()=>{};

		do {
			if (pull || this.needPull) {
				//console.log("pulling...");
				await this.remoteProject.pull();

				let ancestorDir=path.join(this.cwd,".katalyx/ancestor");
				if (!this.fs.existsSync(ancestorDir))
					await this.fs.promises.mkdir(ancestorDir);

				//console.log("merging...");
				await mergeFileTrees({
					log: log,
					local: this.cwd,
					ancestor: ancestorDir,
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
						log("Pushing file: "+pushFn);
						if (!await this.pushFile(pushFn)) {
							log("Need to pull again...");
							this.needPull=true;
						}
					}

					for (let deleteFn of changes.delete) {
						log("Pushing delete: "+deleteFn);
						await this.remoteProject.deleteFile(deleteFn);
						await this.fs.promises.rm(path.join(this.cwd,".katalyx/ancestor",deleteFn));
					}

					if (!this.needPull) {
						this.version=await this.rpc.incProjectVersion({project_id: this.project_id});
						log("Pushed version: "+this.version);
					}
				}
			}
		} while (this.needPull);

		//console.log(changes);
	}
}