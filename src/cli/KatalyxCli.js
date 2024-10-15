import {createQqlClient} from "qql";
import urlJoin from "url-join";
import {DeclaredError, arrayUnique, objectEq, ResolvablePromise, arraySortBy} from "../utils/js-util.js";
import {findFiles} from "../utils/dir-util.js";
import {createRpcProxy} from "fullstack-rpc/client";
import {QuickminApi} from "quickmin-api";
import {createNodeRequestListener} from "serve-fetch";
import {getUserPrefsDir} from "../utils/node-util.js";
import {getFileHash, downloadFile} from "../utils/fs-util.js";
import {LocalFileTreeValue, AncestorFileValue, RemoteMutatorValue, SyncManager,
		SubscribeMqtt, MergeFiles, diffFileTree} from "../sync/index.js";
import http from "http";
import util from "util";
import open from "open";
import path from "path";
import fs from "fs";
import {getContentFileAction} from "./katalyx-cli-util.js";

export default class KatalyxCli {
	constructor({url, cwd, apiKey, mqtt}) {
		this.fs=fs;
		this.cwd=cwd;
		this.url=url;
		if (!this.url)
			this.url="https://katalyx.io";

		this.mqtt=mqtt;

		let headers={};
		if (fs.existsSync(this.getCredentialsPathname())) {
			let tokenData=JSON.parse(fs.readFileSync(this.getCredentialsPathname()))
			headers["authorization"]="Bearer "+tokenData.token;
		}

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
			"katnip.local.json",
			"upload",
			"*.db",
		];
	}

	getCredentialsPathname() {
		return path.join(getUserPrefsDir(),".katalyx-credentials.json");
	}

	async ls() {
		let projects=await this.rpc.listProjects({
			ownership: "all",
			unselect: ["content"]
		});

		for (let project of projects) {
			console.log(
				project.pid.padEnd(25)+
				project.name
			);
		}
	}

	async whoami() {
		console.log(await this.rpc.whoami());
	}

	async login() {
		let tokenPromise=new ResolvablePromise();
		let handler=async (request)=>{
			let tokenData=await request.json();
			if (!tokenData.token)
				throw new Error("Got no token");

			console.log("Got token: "+tokenData.token);
			fs.writeFileSync(this.getCredentialsPathname(),JSON.stringify({
				token: tokenData.token
			}));

			tokenPromise.resolve();

			return new Response(JSON.stringify({success: true}),{
				headers: {
					"Access-Control-Allow-Origin": "*"
				}
			});
		}

		let server=http.createServer(createNodeRequestListener(handler));
		let listenPromise=util.promisify(server.listen.bind(server));
		await listenPromise();

        let loginUrl=new URL(urlJoin(this.url,"clilogin"));
        loginUrl.searchParams.set("clilogin",server.address().port);

		console.log("Listening for token on port: "+server.address().port);
		console.log("Visit the following url:");
		console.log();
		console.log("        "+loginUrl.toString());
		console.log();
        await open(loginUrl.toString());
        await tokenPromise;

        console.log("Credentials stored in: "+this.getCredentialsPathname());
        //server.closeAllConnections();
        server.close();
	}

	async clone({project_id}) {
		this.project=await this.rpc.getProject({
			unselect: ["content","version"],
			where: {pid: project_id}
		});

		if (!this.cwd)
			this.cwd=path.resolve(this.project.name);

		if (fs.existsSync(this.cwd))
			throw new DeclaredError("Already exists: "+this.cwd);

		console.log("Cloning project: "+this.project.name+" to "+this.cwd);
		fs.mkdirSync(this.cwd);
		fs.mkdirSync(path.join(this.cwd,".katalyx"),{recursive: true});

		fs.writeFileSync(path.join(this.cwd,".katalyx/project.json"),JSON.stringify(this.project,null,2));

		//console.log(this.project);
		await this.initSyncManager({init: true, sync: true, enablePush: false});

		let contentFiles=await this.getContentFiles();
		for (let contentFile of contentFiles)
			await this.processContentFile(contentFile);

		await this.saveContentFiles(contentFiles);


		//let contentFiles=await this.getContentFiles();
		//console.log(contentFiles);


		//await this.syncContent();
	}

	async processContentFile(contentFile) {
		//console.log("process: ",contentFile);
		let fn=path.join(this.cwd,"public",contentFile.name);

		switch (getContentFileAction(contentFile)) {
			case "download":
				console.log("Download: "+contentFile.name);
				if (!fs.existsSync(path.join(this.cwd,"public")))
					fs.mkdirSync(path.join(this.cwd,"public"));

				let url=urlJoin(this.url,"admin/_content",contentFile.remoteFile);
				await downloadFile(url,fn,{fs});

				contentFile.syncFile=contentFile.remoteFile;
				contentFile.file=contentFile.remoteFile;
				contentFile.syncHash=await getFileHash(fn,{fs});
				return contentFile;
				break;

			case "upload":
				
				break;

			case "delete":
				console.log("Delete: "+contentFile.name);
				if (fs.existsSync(fn))
					fs.rmSync(fn);

				return;
				break;
		}

		return contentFile;
	}

	async pull({resolve}) {
		if (!this.cwd)
			this.cwd=process.cwd();

		let projectJsonFn=path.join(this.cwd,".katalyx/project.json");
		this.project=JSON.parse(fs.readFileSync(projectJsonFn));
		await this.initSyncManager({init: false, sync: true, enablePush: false});

		let contentFiles=await this.getContentFiles();
		let newContentFiles=[];
		for (let contentFile of contentFiles) {
			let action=getContentFileAction(contentFile)
			//console.log("action: "+action);
			if (["download","delete"].includes(action))
				contentFile=await this.processContentFile(contentFile);

			if (contentFile)
				newContentFiles.push(contentFile);
		}

		await this.saveContentFiles(newContentFiles);

	}

	async sync({resolve}) {
		if (!this.cwd)
			this.cwd=process.cwd();

		let projectJsonFn=path.join(this.cwd,".katalyx/project.json");
		this.project=JSON.parse(fs.readFileSync(projectJsonFn));
		await this.initSyncManager({init: false, sync: true, enablePush: true});
	}

	async status() {
		if (!this.cwd)
			this.cwd=process.cwd();

		let projectJsonFn=path.join(this.cwd,".katalyx/project.json");
		this.project=JSON.parse(fs.readFileSync(projectJsonFn));
		await this.initSyncManager({init: false, sync: false});

		let local=this.syncManager.local.getValue();
		let remote=this.syncManager.remote.getValue();
		let ancestor=this.syncManager.ancestor.getValue();

		let localChanges=diffFileTree(local,ancestor);
		let remoteChanges=diffFileTree(remote,ancestor);
		let changedNames=arrayUnique([
			...Object.keys(localChanges),
			...Object.keys(remoteChanges),
		]);

		let changes=[];
		for (let changedName of changedNames) {
			if (changedName!=".content_manifest.json") {
				changes.push({
					name: changedName,
					local: localChanges[changedName],
					remote: remoteChanges[changedName]
				});
			}
		}

		let contentFiles=await this.getContentFiles();
		let contentFileChanges=contentFiles.filter(c=>getContentFileAction(c));

		if (!changes.length && !contentFileChanges.length) {
			console.log("Up-to-date.");
			return;
		}

		console.log("Changes:")
		for (let change of changes) {
			let changeChar={
				new: "N",
				delete: "D",
				change: "C"
			};

			console.log(
				"  "+
				(change.local?changeChar[change.local]:" ")+
				"+"+
				(change.remote?changeChar[change.remote]:" ")+
				"   "+
				change.name
			);
		}

		for (let contentFile of contentFileChanges) {
			let action=getContentFileAction(contentFile);

			console.log("  "+action.padEnd(16)+contentFile.name);
		}

		//console.log(changes);
	}

	getRemoteValue=async ()=>{
		let project=await this.rpc.getProject({
			select: ["content","version"],
			where: {pid: this.project.pid}
		});

		return {
			value: project.content,
			version: project.version,
		}
	}

	setRemoteValue=async ({newVersion, oldVersion, value})=>{
		return await this.rpc.setProject({
			set: {
				content: value,
				version: newVersion
			},
			where: {
				pid: this.project.pid, 
				version: oldVersion
			}
		});
	}

	async initSyncManager({init, sync, enablePush}) {
		let local=new LocalFileTreeValue({
			fs: this.fs,
			cwd: this.cwd,
			ignore: ["node_modules",".target",".tmp",".katalyx","**/*.js.bundle","public","upload"]
		});

		let contentManifestPath=path.join(this.cwd,".katalyx/content_manifest.json");
		local.addSpecial(".content_manifest.json",{
			getter: ()=>{
				if (fs.existsSync(contentManifestPath))
					return fs.readFileSync(contentManifestPath,"utf8");
			},
			setter: (value)=>{
				fs.writeFileSync(contentManifestPath,value)
			}
		});

		let ancestor=new AncestorFileValue({
			fs: this.fs,
			versionPathname: path.join(this.cwd,".katalyx/ancestor_version"),
			valuePathname: path.join(this.cwd,".katalyx/ancestor_value")
		});

		let remote=new RemoteMutatorValue({
			get: this.getRemoteValue,
			set: this.setRemoteValue,
		});

		let mergeFiles=new MergeFiles({resolve: "remote"});

		let syncManagerOptions={
			local, 
			ancestor, 
			remote, 
			merge: mergeFiles.merge,
			compare: (a,b)=>objectEq(a,b,{compareKeyOrder: false}),
			enablePush: enablePush,
		}

		if (this.mqtt) {
			let mqttCredentals=await this.rpc.getMqttCredentials();
			syncManagerOptions.subscribe=new SubscribeMqtt({
				...mqttCredentals,
				topic: this.project.pid
			});
		}

		this.syncManager=new SyncManager(syncManagerOptions);
		await this.syncManager.init({init, sync});

		/*this.syncManager.addEventListener("syncStatusChange",()=>{
			this.dispatchEvent(new Event("syncStatusChange"));
		})*/
	}

	async close() {
		if (this.syncManager)
			await this.syncManager.close();
	}

	async saveContentFiles(contentFiles) {
		let contentManifest=[];
		let contentState=[];

		for (let contentFile of contentFiles) {
			contentManifest.push({
				name: contentFile.name,
				file: contentFile.file,
				size: contentFile.size
			});

			contentState.push({
				name: contentFile.name,
				syncFile: contentFile.syncFile,
				syncHash: contentFile.syncHash
			});
		}

		let contentStatePath=path.join(this.cwd,".katalyx/content_state.json");
		fs.writeFileSync(contentStatePath,JSON.stringify(contentState,null,2));

		arraySortBy(contentManifest,"name");
		let contentManifestPath=path.join(this.cwd,".katalyx/content_manifest.json");
		let currentContentManifest=JSON.parse(fs.readFileSync(contentManifestPath));
		arraySortBy(currentContentManifest,"name");
		if (!objectEq(contentManifest,currentContentManifest,{compareKeyOrder: false}))
			fs.writeFileSync(contentManifestPath,JSON.stringify(contentManifest,null,2));
	}

	async getContentFiles() {
		let contentFiles={};

		let publicPath=path.join(this.cwd,"public");
		if (fs.existsSync(publicPath)) {
			for (let localName of fs.readdirSync(publicPath)) {
				if (!contentFiles[localName])
					contentFiles[localName]={name: localName};

				let fn=path.join(this.cwd,"public",localName);
				contentFiles[localName].hash=await getFileHash(fn,{fs});
			}
		}

		let contentStatePath=path.join(this.cwd,".katalyx/content_state.json");
		if (fs.existsSync(contentStatePath)) {
			for (let stateEntry of JSON.parse(fs.readFileSync(contentStatePath))) {
				if (!contentFiles[stateEntry.name])
					contentFiles[stateEntry.name]={name: stateEntry.name};

				contentFiles[stateEntry.name]={
					...contentFiles[stateEntry.name],
					...stateEntry
				};
			}
		}

		let contentManifestPath=path.join(this.cwd,".katalyx/content_manifest.json");
		if (fs.existsSync(contentManifestPath)) {
			for (let manifestEntry of JSON.parse(fs.readFileSync(contentManifestPath))) {
				if (!contentFiles[manifestEntry.name])
					contentFiles[manifestEntry.name]={name: manifestEntry.name};

				contentFiles[manifestEntry.name]={
					...contentFiles[manifestEntry.name],
					...manifestEntry
				};
			}
		}

		let remoteManifestJson=this.syncManager.remote.getValue()[".content_manifest.json"];
		let remoteManifest=JSON.parse(remoteManifestJson);
		for (let manifestEntry of remoteManifest) {
			if (!contentFiles[manifestEntry.name])
				contentFiles[manifestEntry.name]={name: manifestEntry.name};

			contentFiles[manifestEntry.name]={
				...contentFiles[manifestEntry.name],
				remoteFile: manifestEntry.file
			};
		}

		return Object.values(contentFiles);
	}
}