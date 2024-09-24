import {createQqlClient} from "qql";
import urlJoin from "url-join";
import path from "path";
import fs from "fs";
import {DeclaredError} from "../utils/js-util.js";
import {findMatchingFiles, getFileOps} from "../utils/fs-util.js";
import Merge from "../utils/Merge.js";
import {createRpcProxy} from "fullstack-rpc/client";

export default class KatalyxCli {
	constructor({url}) {
		this.url=url;
		if (!this.url)
			this.url="https://katalyx.io";

		this.qql=createQqlClient(urlJoin(url,"admin/_qql"));
		this.rpc=createRpcProxy({
			url: urlJoin(url,"rpc"),
			headers: {
				"x-api-key": "dummychangeme"
			}
		});
	}

	async clone(projectId) {
		let project=await this.qql({oneFrom: "projects", where: {pid: projectId}});
		if (!this.cwd)
			this.cwd=path.resolve(project.name);

		if (fs.existsSync(this.cwd))
			throw new DeclaredError("Already exists: "+this.cwd);

		console.log("Cloning project: "+project.name+" to "+this.cwd);
		fs.mkdirSync(this.cwd);
		fs.mkdirSync(path.join(this.cwd,".katalyx/base_revision"),{recursive: true});

		let projectJsonFn=path.join(this.cwd,".katalyx/project.json");
		fs.writeFileSync(projectJsonFn,JSON.stringify(project,null,2));

		let projectFiles=await this.qql({
			manyFrom: "project_files",
			where: {project_id: project.id}
		});

		for (let projectFile of projectFiles) {
			let fn=path.join(this.cwd,projectFile.name);
			fs.mkdirSync(path.dirname(fn),{recursive: true});
			fs.writeFileSync(fn,projectFile.content);

			fn=path.join(this.cwd,".katalyx/base_revision",projectFile.name);
			fs.mkdirSync(path.dirname(fn),{recursive: true});
			fs.writeFileSync(fn,projectFile.content);
		}
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
			this.projectFiles[projectFileEntry.name]=projectFileEntry.content;

		return this.projectFiles;
	}

	// todo! don't search node_modules and stuff...
	async getFiles(dir) {
		let files={};
		//console.log("getting project");
		let fileNames=await findMatchingFiles(dir,["**"],{fs});
		//console.log("have project files: "+fileNames.length);
		for (let fileName of fileNames)
			files[fileName]=await fs.promises.readFile(path.join(dir,fileName),"utf8");

		return files;
	}

	logChangeSet(changeSet) {
		for (let fn of changeSet.new)
			console.log("  A "+fn);

		for (let fn of changeSet.deleted)
			console.log("  D "+fn);

		for (let fn of changeSet.changed)
			console.log("  M "+fn);
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

	async status() {
		let merge=await this.getMerge();
		if (merge.isUpToDate())
			console.log("Up-to-date.");

		let ourChanges=merge.getOurChanges();
		if (ourChanges.numTotal) {
			console.log("Local Changes:");
			this.logChangeSet(ourChanges);
		}

		let theirChanges=merge.getTheirChanges();
		if (theirChanges.numTotal) {
			console.log("Remote Changes:");
			this.logChangeSet(theirChanges);
		}
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

		//console.log(mergeFiles);

		let baseOps=getFileOps(merge.originalFiles,merge.theirFiles);
		await this.applyFileOps(path.join(this.cwd,".katalyx/base_revision"),baseOps);

		let localOps=getFileOps(merge.ourFiles,mergeFiles);
		await this.applyFileOps(this.cwd,localOps);
	}

	async sync({resolve}) {
		if (!this.cwd)
			this.cwd=process.cwd();

		let merge=await this.getMerge();
		let mergeFiles=merge.merge({resolve});
		//console.log(mergeFiles);

		let remoteOps=getFileOps(merge.theirFiles,mergeFiles);
		let project=this.getProject();
		if (!project.pid)
			throw new Error("Project id missing");

		await this.rpc.updateProjectFiles({
			pid: project.pid,
			files: remoteOps
		});

		let baseOps=getFileOps(merge.originalFiles,mergeFiles);
		await this.applyFileOps(path.join(this.cwd,".katalyx/base_revision"),baseOps);

		let localOps=getFileOps(merge.ourFiles,mergeFiles);
		await this.applyFileOps(this.cwd,localOps);
	}
}