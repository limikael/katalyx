export default class RemoteDbValue {
	constructor({get, set}) {
		this.get=get;
		this.set=set;
	}

	async init() {
		await this.pull();

		//console.log("Pulled remote, version="+this.version);
	}

	getValue() {
		return this.value;
	}

	getVersion() {
		return this.version;
	}

	async pull() {
		let data=await this.get();
		if (!data.hasOwnProperty("value") ||
				!data.hasOwnProperty("version"))
			throw new Error("Expected value and version");

		this.value=data.value;
		this.version=data.version;

		if (!this.version)
			throw new Error("Remote value doesn't have a version!");

		if (!this.value)
			this.value="";

		//console.log("pull, version=",this.version,"val=",this.value);
	}

	async setValue(value) {
		let newVersion=this.version+1;

		let res=await this.set({
			oldVersion: this.version,
			newVersion: newVersion,
			value: value
		});

		if (res) {
			console.log("pushed, new version="+newVersion);
			this.version=newVersion;
			this.value=value;
			return true;
		}

		else {
			console.log("push failed, need to pull...");
			return false;
		}
	}
}