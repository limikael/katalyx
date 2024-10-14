export default class RemoteDbValue {
	constructor({qql, collectionName, where, versionField, valueField}) {
		this.qql=qql;
		this.where=where;
		this.versionField=versionField;
		this.valueField=valueField;
		this.collectionName=collectionName;
	}

	async init() {
		await this.pull();

		console.log("Pulled remote, version="+this.version);
	}

	getValue() {
		return this.value;
	}

	getVersion() {
		return this.version;
	}

	async pull() {
		let row=await this.qql({
			oneFrom: this.collectionName,
			where: this.where
		});

		if (!row)
			throw new Error("Unable to pull value");

		this.value=row[this.valueField];
		this.version=row[this.versionField];

		if (!this.version)
			throw new Error("Remote value doesn't have a version!");

		/*if (!this.version)
			this.version=0;*/

		if (!this.value)
			this.value="";

		//console.log("pull, version=",this.version,"val=",this.value);
	}

	async setValue(value) {
		let newVersion=this.version+1;

		let changes=await this.qql({
			update: this.collectionName,
			set: {
				[this.valueField]: value,
				[this.versionField]: newVersion
			},
			where: {
				...this.where,
				[this.versionField]: this.version
			}
		});

		if (changes==0) {
			console.log("Couldn't push, pull first...")
			return false;
		}

		if (changes==1) {
			console.log("Pushed new version: "+newVersion);
			this.version=newVersion;
			this.value=value;
			return true;
		}

		throw new Error("Expected 1 or 0 changes, got "+changes);
	}
}