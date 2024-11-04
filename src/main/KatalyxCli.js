import {createQqlClient} from "qql";
import urlJoin from "url-join";
import {DeclaredError, arrayUnique, objectEq, ResolvablePromise, arraySortBy} from "../utils/js-util.js";
import {findFiles} from "../utils/dir-util.js";
import {createRpcProxy} from "fullstack-rpc/client";
import {QuickminApi} from "quickmin-api";
import {createNodeRequestListener} from "serve-fetch";
import {getUserPrefsDir} from "../utils/node-util.js";
import {getFileHash, downloadFile, getFileObject} from "../utils/fs-util.js";
import {diffFileTrees} from "../collab/merge-util.js";
import ProjectFileSync from "../collab/ProjectFileSync.js";
import http from "http";
import util from "util";
import open from "open";
import path from "path";
import fs from "fs";

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
	}

	log=(message)=>{
		console.log(message);
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
			where: {pid: project_id}
		});

		if (!this.cwd)
			this.cwd=path.resolve(this.project.name);

		if (fs.existsSync(this.cwd))
			throw new DeclaredError("Already exists: "+this.cwd);

		console.log("Cloning Project: "+this.project.name);
		console.log("Target: "+this.cwd);
		fs.mkdirSync(this.cwd);
		fs.mkdirSync(path.join(this.cwd,".katalyx"),{recursive: true});

		let projectJsonFn=path.join(this.cwd,".katalyx/project.json");
		fs.writeFileSync(projectJsonFn,JSON.stringify(this.project,null,2));

		this.initProjectFileSync();
		await this.projectFileSync.sync({pull: true, log: this.log});

		console.log("Cloned Version: "+this.project.version);
	}

	async pull({resolve}) {
		if (!this.cwd)
			this.cwd=process.cwd();

		let projectJsonFn=path.join(this.cwd,".katalyx/project.json");
		this.project=JSON.parse(fs.readFileSync(projectJsonFn));

		this.initProjectFileSync();
		await this.projectFileSync.sync({pull: true, log: this.log});

		//console.log("Project Updated...");
	}

	async sync({resolve}) {
		if (!this.cwd)
			this.cwd=process.cwd();

		let projectJsonFn=path.join(this.cwd,".katalyx/project.json");
		this.project=JSON.parse(fs.readFileSync(projectJsonFn));

		this.initProjectFileSync();
		await this.projectFileSync.sync({pull: true, push: true, log: this.log});

		//console.log("Project Synced...");
	}

	async status() {
		if (!this.cwd)
			this.cwd=process.cwd();

		let projectJsonFn=path.join(this.cwd,".katalyx/project.json");
		this.project=JSON.parse(fs.readFileSync(projectJsonFn));

		this.initProjectFileSync();
		await this.projectFileSync.remoteProject.pull();

		let changes=await diffFileTrees({
			local: this.cwd,
			remote: path.join(this.cwd,".katalyx/remote"),
			ancestor: path.join(this.cwd,".katalyx/ancestor"),
			fs: fs,
			ignore: this.projectFileSync.ignore
		});

		changes=changes.filter(diffState=>diffState.local||diffState.remote);

		if (!changes.length) {
			console.log("Up-to-date.");
		}

		else {
			console.log("Local".padEnd(8)+"Remote".padEnd(8)+"Path");
			console.log("------------------------");

			function getChangeLabel(changeStatus) {
				if (!changeStatus)
					return "";

				return (changeStatus.charAt(0).toUpperCase()+changeStatus.slice(1));
			}

			for (let change of changes) {
				console.log(
					getChangeLabel(change.local).padEnd(8)+
					getChangeLabel(change.remote).padEnd(8)+
					change.name
				);
			}
		}
	}

	initProjectFileSync() {
		this.projectFileSync=new ProjectFileSync({
			fs: fs,
			rpc: this.rpc,
			qm: this.qm,
			project_id: this.project.id,
			version: this.project.version,
			ignore: [
				"node_modules",".target",".tmp",".katalyx","**/*.js.bundle",
				"public/*.js","public/*.css","upload",".devdb.json"
			],
			cwd: this.cwd,
			contentUrl: urlJoin(this.url,"admin/_content")
		});
	}

	async close() {
	}
}