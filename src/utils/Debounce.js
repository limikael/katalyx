import {ResolvablePromise} from "./js-util.js";

export default class Debounce extends EventTarget {
	constructor(action, {delayBetween, delayBefore}={}) {
		super();

		this.action=action;
		this.currentAction=null;
		this.error=null;
		this.again=false;
		this.delayBefore=delayBefore;
		this.delayBetween=delayBetween;
		if (this.delayBetween===undefined)
			this.delayBetween=250;
	}

	async awaitCurrentAction() {
		if (this.currentAction)
			await this.currentAction;
	}

	async trigger() {
		if (this.currentAction) {
			this.again=true;
			return await this.currentAction;
		}

		this.currentAction=new ResolvablePromise();
		this.dispatchEvent(new Event("change"));

		do {
			//console.log("debounce delay before: "+this.delayBefore);
			if (this.delayBefore)
				await new Promise(r=>setTimeout(r,this.delayBefore));

			this.again=false;
			this.error=null;

			try {
				await this.action();
			}

			catch (e) {
				console.log("debounce error ",e)
				this.error=e;
			}

			if (this.again)
				await new Promise(r=>setTimeout(r,this.delayBetween));

		} while (this.again);

		this.currentAction.resolve();
		this.currentAction=null;

		this.dispatchEvent(new Event("change"));
	}

	getState() {
		if (this.error)
			return "error";

		if (this.currentAction)
			return "working";

		return "clean";
	}
}