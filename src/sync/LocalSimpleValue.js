export default class LocalSimpleValue extends EventTarget {
	constructor() {
		super();
		this.value="";
	}

	getValue() {
		return this.value;
	}

	setValue(v) {
		//console.log("set: "+v);

		this.value=v;
		this.dispatchEvent(new Event("change"));
	}
}