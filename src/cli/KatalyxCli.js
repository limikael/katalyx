import {createQqlClient} from "qql";
import urlJoin from "url-join";
import path from "path";
import fs from "fs";
import {DeclaredError, arrayUnique, objectEq, ResolvablePromise} from "../utils/js-util.js";
import {findFiles} from "../utils/dir-util.js";
import {createRpcProxy} from "fullstack-rpc/client";
import {QuickminApi} from "quickmin-api";
import {createNodeRequestListener} from "serve-fetch";
import http from "http";
import util from "util";
import open from "open";
import {getUserPrefsDir} from "../utils/node-util.js";
import {LocalFileTreeValue, AncestorFileValue, RemoteMutatorValue, SyncManager,
		SubscribeMqtt, MergeFiles, diffFileTree} from "../sync/index.js";

export default class KatalyxCli {
	constructor({url, cwd, apiKey}) {
		this.fs=fs;
		this.cwd=cwd;
		this.url=url;
		if (!this.url)
			this.url="https://katalyx.io";

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
		await this.initSyncManager({init: true, sync: true});
	}

	async pull({resolve}) {
		if (!this.cwd)
			this.cwd=process.cwd();

		let projectJsonFn=path.join(this.cwd,".katalyx/project.json");
		this.project=JSON.parse(fs.readFileSync(projectJsonFn));
		await this.initSyncManager({init: false, sync: true, enablePush: false});
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
		for (let changedName of changedNames)
			changes.push({
				name: changedName,
				local: localChanges[changedName],
				remote: remoteChanges[changedName]
			});

		if (!changes.length) {
			console.log("Up-to-date.");
			return;
		}

		console.log("Changes (local+remote):")
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

		//console.log(changes);
	}

	logChangeSet(changeSet) {
		for (let fn of changeSet.new)
			console.log("  A "+fn);

		for (let fn of changeSet.deleted)
			console.log("  D "+fn);

		for (let fn of changeSet.changed)
			console.log("  M "+fn);
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
		let mqttCredentals=await this.rpc.getMqttCredentials();
		//console.log("mqtt ",mqttCredentals);

		let local=new LocalFileTreeValue({
			fs: this.fs,
			cwd: this.cwd,
			ignore: ["node_modules",".target",".tmp",".katalyx","**/*.js.bundle","public","upload"]
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

		let subscribe=new SubscribeMqtt({
			...mqttCredentals,
			topic: this.project.pid
		});
		let mergeFiles=new MergeFiles({resolve: "remote"});

		this.syncManager=new SyncManager({
			local, 
			ancestor, 
			remote, 
			subscribe, 
			merge: mergeFiles.merge,
			compare: objectEq,
			enablePush: enablePush,
		});
		await this.syncManager.init({init, sync});

		/*this.syncManager.addEventListener("syncStatusChange",()=>{
			this.dispatchEvent(new Event("syncStatusChange"));
		})*/
	}

	async close() {
		if (this.syncManager)
			await this.syncManager.close();
	}
}