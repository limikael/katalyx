import {dirForEachSync, findFilesSync} from "../utils/dir-util.js";
import {arrayDifference} from "../utils/js-util.js";
import path from "path-browserify";

export default class LocalFileTreeValue {
	constructor({fs, ignore, cwd}) {
		this.fs=fs;
		this.cwd=cwd;
		this.ignore=ignore;
		this.special={};
	}

	addSpecial(name, {getter, setter}) {
		this.special[name]={getter,setter};
	}

	addSpecialJson(name) {
		let getter=()=>{
			let fullFn=path.join(this.cwd,name);
			if (!this.fs.existsSync(fullFn))
				return;

			return JSON.parse(this.fs.readFileSync(fullFn));
		}

		let setter=(value)=>{
			if (value===undefined)
				value=null;

			let fileValue=JSON.stringify(value);
			let fullFn=path.join(this.cwd,name);

			if (!this.fs.existsSync(fullFn) ||
					this.fs.readFileSync(fullFn,"utf8")!=fileValue)
				this.fs.writeFileSync(fullFn,fileValue);
		}

		this.addSpecial(name,{getter, setter});
	}

	getValue() {
		let currentTree={};
		let currentPathnames=findFilesSync(this.cwd,{
			ignore: this.ignore,
			fs: this.fs
		});

		for (let fn of currentPathnames) {
			let fullFn=path.join(this.cwd,fn);
			currentTree[fn]=this.fs.readFileSync(fullFn,"utf8");
		}

		for (let fn in this.special) {
			let specialValue=this.special[fn].getter();
			if (specialValue)
				currentTree[fn]=specialValue;
		}

		return currentTree;
	}

	setValue(targetTree) {
		//console.log("setting",targetTree);

		let currentPathnames=findFilesSync(this.cwd,{
			ignore: this.ignore,
			fs: this.fs
		});

		let deletePathnames=arrayDifference(currentPathnames,Object.keys(targetTree));
		for (let fn of deletePathnames) {
			if (!Object.keys(this.special).includes(fn)) {
				let fullFn=path.join(this.cwd,fn);
				console.log("delete: "+fullFn);
				this.fs.unlinkSync(fullFn);			
			}
		}

		for (let fn in targetTree) {
			if (Object.keys(this.special).includes(fn)) {
				//console.log("it is special: "+fn);
				this.special[fn].setter(targetTree[fn]);
			}

			else {
				let fullFn=path.join(this.cwd,fn);
				if (!this.fs.existsSync(path.dirname(fullFn)))
					this.fs.mkdirSync(path.dirname(fullFn),{recursive: true});

				if (!this.fs.existsSync(fullFn) ||
						this.fs.readFileSync(fullFn,"utf8")!=targetTree[fn]) {
					//console.log("writing remote change: "+fn);
					this.fs.writeFileSync(fullFn,targetTree[fn]);
				}
			}
		}

		//console.log("done setting");
	}
}
