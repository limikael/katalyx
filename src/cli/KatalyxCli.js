import {createQqlClient} from "qql";
import urlJoin from "url-join";
import path from "path";
import fs from "fs";
import {DeclaredError, arrayUnique} from "../utils/js-util.js";
import {getFileOps, getFileHash, downloadFile, getFileObject} from "../utils/fs-util.js";
import {findFiles} from "../utils/dir-util.js";
import Merge from "../utils/Merge.js";
import BinMerge from "../utils/BinMerge.js";
import {createRpcProxy} from "fullstack-rpc/client";
import {QuickminApi} from "quickmin-api";

export default class KatalyxCli {
	constructor({url, cwd, apiKey}) {
		this.cwd=cwd;
		this.url=url;
		if (!this.url)
			this.url="https://katalyx.io";

		let headers={};
		if (apiKey)
			headers["x-api-key"]=apiKey;

		//console.log(this.url);

		this.qm=new QuickminApi({
			url: urlJoin(url,"admin"),
			headers: headers
		});
		this.qql=createQqlClient(urlJoin(url,"admin/_qql"));
		this.rpc=createRpcProxy({
			url: urlJoin(url,"rpc"),
			headers: headers
		});

		this.ignore=[
			"node_modules",
			".*",
			"yarn.lock",
			"public/*.css",
			"public/*.js",
			"upload",
			"*.db",
		];
	}

	async clone({project_id}) {
		let project=await this.qql({oneFrom: "projects", where: {pid: project_id}});
		if (!project)
			throw new DeclaredError("Project not found: "+project_id);

		if (!this.cwd)
			this.cwd=path.resolve(project.name);

		if (fs.existsSync(this.cwd))
			throw new DeclaredError("Already exists: "+this.cwd);

		console.log("Cloning project: "+project.name+" to "+this.cwd);
		fs.mkdirSync(this.cwd);
		fs.mkdirSync(path.join(this.cwd,".katalyx/base_revision"),{recursive: true});

		let projectJsonFn=path.join(this.cwd,".katalyx/project.json");
		fs.writeFileSync(projectJsonFn,JSON.stringify(project,null,2));

		let gitIgnoreFn=path.join(this.cwd,".gitignore");
		fs.writeFileSync(gitIgnoreFn,`.katalyx\nnode_modules\nquickmin.db\n`);

		let projectFiles=await this.qql({
			manyFrom: "project_files",
			where: {project_id: project.id}
		});

		let contentFiles={};
		for (let projectFile of projectFiles) {
			if (projectFile.content) {
				let fn=path.join(this.cwd,projectFile.name);
				fs.mkdirSync(path.dirname(fn),{recursive: true});
				fs.writeFileSync(fn,projectFile.content);

				fn=path.join(this.cwd,".katalyx/base_revision",projectFile.name);
				fs.mkdirSync(path.dirname(fn),{recursive: true});
				fs.writeFileSync(fn,projectFile.content);
			}

			if (projectFile.file) {
				let fn=path.join(this.cwd,projectFile.name);
				fs.mkdirSync(path.dirname(fn),{recursive: true});
				let url=urlJoin(this.url,"admin/_content",projectFile.file);
				await downloadFile(url,fn,{fs});
				let hash=await getFileHash(fn,{fs});

				contentFiles[projectFile.name]={
					local: hash,
					remote: projectFile.file
				}
			}
		}

		let contentFilesJsonFn=path.join(this.cwd,".katalyx/content.json");
		fs.writeFileSync(contentFilesJsonFn,JSON.stringify(contentFiles,null,2));
	}

	getProject() {
		let projectJsonFn=path.join(this.cwd,".katalyx/project.json");
		let project=JSON.parse(fs.readFileSync(projectJsonFn));
		if (!project)
			throw new Error("Project file missing!");

		return project;
	}

	async getProjectFiles() {
		if (this.projectFiles)
			return this.projectFiles;

		let project=this.getProject();
		let projectFileEntries=await this.qql({
			manyFrom: "project_files",
			where: {project_id: project.id}
		});

		this.projectFiles={};
		for (let projectFileEntry of projectFileEntries)
			if (projectFileEntry.content)
				this.projectFiles[projectFileEntry.name]=projectFileEntry.content;

		return this.projectFiles;
	}

	async getFiles(dir) {
		let files={};
		//console.log("getting project");
		let fileNames=await findFiles(dir,{fs, ignore: ["public",...this.ignore]});
		//console.log("have project files: "+fileNames.length);
		for (let fileName of fileNames)
			files[fileName]=await fs.promises.readFile(path.join(dir,fileName),"utf8");

		return files;
	}

	getCwd() {
		if (this.cwd)
			return this.cwd;

		return process.cwd();
	}

	async getFileHashes(dir) {
		let hashes={};
		let fileNames=await findFiles(dir,{fs, patterns: "public/**", ignore: this.ignore});

		for (let fileName of fileNames)
			hashes[fileName]=await getFileHash(path.join(dir,fileName),{fs});

		return hashes;
	}

	async getProjectHashes() {
		let project=this.getProject();
		let projectFileEntries=await this.qql({
			manyFrom: "project_files",
			where: {project_id: project.id}
		});

		let projectHashes={};
		for (let projectFileEntry of projectFileEntries)
			if (projectFileEntry.file)
				projectHashes[projectFileEntry.name]=projectFileEntry.file;

		return projectHashes;
	}

	async getBinMerge() {
		let localFiles=await this.getFileHashes(this.getCwd());
		let remoteFiles=await this.getProjectHashes();
		let baseFiles=JSON.parse(fs.readFileSync(path.join(this.getCwd(),".katalyx/content.json")));
		return new BinMerge({
			localFiles,
			remoteFiles,
			baseFiles
		});
	}

	async getMerge() {
		if (!this.cwd)
			this.cwd=process.cwd();

		let ourFiles=await this.getFiles(this.cwd);
		let originalFiles=await this.getFiles(path.join(this.cwd,".katalyx/base_revision"));
		let theirFiles=await this.getProjectFiles();

		let merge=new Merge({
			ourFiles: ourFiles,
			originalFiles: originalFiles,
			theirFiles: theirFiles,
		});

		return merge;
	}

	logChangeSet(changeSet) {
		for (let fn of changeSet.new)
			console.log("  A "+fn);

		for (let fn of changeSet.deleted)
			console.log("  D "+fn);

		for (let fn of changeSet.changed)
			console.log("  M "+fn);
	}

	printChangeStatus(changeSet, {label, noLabel, long, short}) {
		if (!changeSet.numTotal) {
			console.log(noLabel);
			return;
		}

		if (short) {
			let summaryItems=[];
			if (changeSet.new.length)
				summaryItems.push(changeSet.new.length+" new")

			if (changeSet.deleted.length)
				summaryItems.push(changeSet.deleted.length+" deleted")

			if (changeSet.changed.length)
				summaryItems.push(changeSet.changed.length+" changed")

			console.log(label+" "+summaryItems.join(", ")+".");
		}

		else {
			console.log(label);
		}

		if (long) {
			this.logChangeSet(changeSet);
		}
	}

	async status() {
		let merge=await this.getMerge();
		let binMerge=await this.getBinMerge();

		this.printChangeStatus(merge.getTheirChanges(),{
			label: "Remote Changes:",
			noLabel: "No Remote Changes.",
			long: true
		});

		this.printChangeStatus(merge.getOurChanges(),{
			label: "Local Changes:",
			noLabel: "No Local Changes.",
			long: true
		});

		console.log(binMerge.getStatusString());
	}

	async applyFileOps(baseDir,ops) {
		for (let fn in ops) {
			let fullFn=path.join(baseDir,fn);
			if (ops[fn]===undefined || ops[fn]===null) {
				await fs.promises.rm(fullFn);
			}

			else {
				await fs.promises.mkdir(path.dirname(fullFn),{recursive: true});
				await fs.promises.writeFile(fullFn,ops[fn]);
			}
		}
	}

	async pull({resolve}) {
		if (!this.cwd)
			this.cwd=process.cwd();

		let merge=await this.getMerge();
		let mergeFiles=merge.merge({resolve});
		let binMerge=await this.getBinMerge();
		let binMergeOps=binMerge.getMergeOps({resolve});

		this.printChangeStatus(merge.getTheirChanges(),{
			label: "Pulling Remote Changes:",
			noLabel: "No Remote Changes.",
			short: true
		});

		console.log(binMerge.getStatusString({resolve, includeLocal: false}));

		//console.log(mergeFiles);

		let baseOps=getFileOps(merge.originalFiles,merge.theirFiles);
		await this.applyFileOps(path.join(this.cwd,".katalyx/base_revision"),baseOps);

		let localOps=getFileOps(merge.ourFiles,mergeFiles);
		await this.applyFileOps(this.cwd,localOps);

		let contentManifestFn=path.join(this.getCwd(),".katalyx/content.json");
		let contentManifest=JSON.parse(await fs.promises.readFile(contentManifestFn));
		for (let fn in binMergeOps) {
			switch (binMergeOps[fn]) {
				case "upload":
					// Don't do any uploading when pulling.
					break;

				case "download":
					let contentUrl=urlJoin(this.url,"admin/_content",binMerge.remoteFiles[fn]);
					let contentFn=path.join(this.getCwd(),fn);
					await downloadFile(contentUrl,contentFn,{fs});
					//console.log("Download: "+contentUrl+" -> "+contentFn);

					contentManifest[fn]={
						local: await getFileHash(contentFn,{fs}),
						remote: binMerge.remoteFiles[fn],
					}
					break;

				case "delete":
					if (!binMerge.remoteFiles[fn]) {
						let contentFn=path.join(this.getCwd(),fn);
						if (fs.existsSync(contentFn))
							await fs.promises.rm(contentFn);

						delete contentManifest[fn];
					}
					break;
			}
		}

		await fs.promises.writeFile(contentManifestFn,JSON.stringify(contentManifest,null,2));
	}

	async sync({resolve}) {
		if (!this.cwd)
			this.cwd=process.cwd();

		let merge=await this.getMerge();
		let mergeFiles=merge.merge({resolve});
		let binMerge=await this.getBinMerge();
		let binMergeOps=binMerge.getMergeOps({resolve});

		//console.log(mergeFiles);

		this.printChangeStatus(merge.getTheirChanges(),{
			label: "Pulling Remote Changes:",
			noLabel: "No Remote Changes.",
			short: true
		});

		this.printChangeStatus(merge.getOurChanges(),{
			label: "Pushing Local Changes:",
			noLabel: "No Local Changes.",
			short: true
		});

		console.log(binMerge.getStatusString({resolve}));

		let remoteOps=getFileOps(merge.theirFiles,mergeFiles);
		let project=this.getProject();
		if (!project.pid)
			throw new Error("Project id missing");

		if (Object.keys(remoteOps).length) {
			await this.rpc.updateProjectFiles({
				pid: project.pid,
				files: remoteOps
			});
		}

		let baseOps=getFileOps(merge.originalFiles,mergeFiles);
		await this.applyFileOps(path.join(this.cwd,".katalyx/base_revision"),baseOps);

		let localOps=getFileOps(merge.ourFiles,mergeFiles);
		await this.applyFileOps(this.cwd,localOps);

		let contentManifestFn=path.join(this.getCwd(),".katalyx/content.json");
		let contentManifest=JSON.parse(await fs.promises.readFile(contentManifestFn));
		for (let fn in binMergeOps) {
			switch (binMergeOps[fn]) {
				case "upload":
					let localFn=path.join(this.getCwd(),fn);
					let remoteFn=await this.qm.uploadFile(await getFileObject(localFn,{fs}));
					await this.rpc.updateProjectFiles({
						pid: project.pid,
						files: {
							[fn]: {file: remoteFn}
						}
					});

					contentManifest[fn]={
						local: await getFileHash(localFn,{fs}),
						remote: remoteFn,
					}
					break;

				case "download":
					let contentUrl=urlJoin(this.url,"admin/_content",binMerge.remoteFiles[fn]);
					let contentFn=path.join(this.getCwd(),fn);
					await downloadFile(contentUrl,contentFn,{fs});
					//console.log("Download: "+contentUrl+" -> "+contentFn);

					contentManifest[fn]={
						local: await getFileHash(contentFn,{fs}),
						remote: binMerge.remoteFiles[fn],
					}
					break;

				case "delete":
					let delContentFn=path.join(this.getCwd(),fn);
					if (fs.existsSync(delContentFn))
						await fs.promises.rm(delContentFn);

					if (binMerge.remoteFiles[fn]) {
						await this.rpc.updateProjectFiles({
							pid: project.pid,
							files: {[fn]: null}
						});
					}

					delete contentManifest[fn];
					break;
			}

			await fs.promises.writeFile(contentManifestFn,JSON.stringify(contentManifest,null,2));
		}
	}
}