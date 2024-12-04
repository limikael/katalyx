import path from "path-browserify";
import {getStringHash, getFileHash, downloadFile, getFileObject, mkdirParent} from "../utils/fs-util.js";
import urlJoin from "url-join";
import {findFiles} from "../utils/dir-util.js";
import {arrayDifference} from "../utils/js-util.js";

export default class RemoteProject {
	constructor({project_id, rpc, remoteCwd, contentUrl, fs, qm}) {
		this.project_id=project_id;
		this.rpc=rpc;
		this.remoteCwd=remoteCwd;
		this.fs=fs;
		this.qm=qm;
		this.contentUrl=contentUrl;
	}

	async pull() {
		let files=await this.rpc.getProjectFiles({project_id: this.project_id});

		await this.fs.promises.mkdir(this.remoteCwd,{recursive: true});
		let currentFileNames=await findFiles(this.remoteCwd,{ignore: this.ignore, fs: this.fs});
		let targetFileNames=[];

		for (let file of files) {
			targetFileNames.push(file.name);

			let fullFn=path.join(this.remoteCwd,file.name);
			await mkdirParent(fullFn,{fs: this.fs});

			if (file.file) {
				let needDownload=true;
				if (this.fs.existsSync(fullFn)) {
					let hash=await getFileHash(fullFn,{fs:this.fs});
					//console.log("existing hash: "+hash);
					if (hash==file.hash)
						needDownload=false;
				}

				if (needDownload) {
					let url=urlJoin(this.contentUrl,file.file);
					await downloadFile(url,fullFn,{fs:this.fs});
				}
			}

			else {
				await this.fs.promises.writeFile(fullFn,file.content);
			}
		}

		let deleteFileNames=arrayDifference(currentFileNames,targetFileNames);
		//console.log("deleting remote: "+deleteFileNames);
		for (let deleteFileName of deleteFileNames)
			await this.fs.promises.rm(path.join(this.remoteCwd,deleteFileName));
	}

	async pushBinFile(fn, sourceFn) {
		let fileObject=await getFileObject(sourceFn,{fs: this.fs});
		let fileId=await this.qm.uploadFile(fileObject);

		let res=await this.rpc.setProjectBinFile({
			project_id: this.project_id,
			name: fn,
			file: fileId,
			hash: await getFileHash(sourceFn,{fs: this.fs})
		});

		if (!res)
			return false;

		await mkdirParent(path.join(this.remoteCwd,fn),{fs: this.fs});
		await fs.promises.cp(
			sourceFn,
			path.join(this.remoteCwd,fn)
		);

		return true;
	}

	async pushFile(fn, content) {
		let oldHash="";
		let fullFn=path.join(this.remoteCwd,fn);
		if (this.fs.existsSync(fullFn))
			oldHash=await getFileHash(fullFn,{fs:this.fs});

		let res=await this.rpc.setProjectFile({
			project_id: this.project_id,
			name: fn,
			content: content,
			oldHash: oldHash
		});

		if (!res)
			return false;

		await mkdirParent(fullFn,{fs: this.fs});
		await this.fs.promises.writeFile(fullFn,content);
		return true;
	}

	async deleteFile(fn) {
		await this.rpc.deleteProjectFile({
			project_id: this.project_id,
			name: fn,
		});

		await this.fs.promises.rm(path.join(this.remoteCwd,fn));
	}
}