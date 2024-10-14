export default class AncestorSimpleValue {
	constructor({fs, versionPathname, valuePathname}) {
		this.versionPathname=versionPathname;
		this.valuePathname=valuePathname;
		this.fs=fs;
	}

	getVersion() {
		if (!this.fs.existsSync(this.versionPathname))
			return;

		return JSON.parse(this.fs.readFileSync(this.versionPathname));
	}

	setVersion(version) {
		this.fs.writeFileSync(this.versionPathname,JSON.stringify(version));
	}

	getValue() {
		if (!this.fs.existsSync(this.valuePathname))
			return;

		return JSON.parse(this.fs.readFileSync(this.valuePathname,"utf8"));
	}

	setValue(value) {
		this.fs.writeFileSync(this.valuePathname,JSON.stringify(value));
	}
}