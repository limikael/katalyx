import Debounce from "../utils/Debounce.js";

export default class SyncManager extends EventTarget {
	constructor({local, remote, ancestor, merge, subscribe, compare, enablePush}) {
		super();

		this.local=local;
		this.remote=remote;
		this.ancestor=ancestor;
		this.merge=merge;
		this.subscribe=subscribe;
		this.compare=compare;
		this.syncDebounce=new Debounce(()=>this.sync());
		this.syncDebounce.addEventListener("change",()=>{
			this.dispatchEvent(new Event("syncStatusChange"));
		})

		this.enablePush=enablePush;
		if (this.enablePush===undefined)
			this.enablePush=true;

		if (this.subscribe)
			this.subscribe.syncManager=this;
	}

	getSyncStatus() {
		return this.syncDebounce.getState();
	}

	async sync({enablePush}={}) {
		if (enablePush===undefined)
			enablePush=this.enablePush;

		console.log("Syncing, push="+enablePush);

		do {
			if (this.needPull) {
				this.needPull=false;
				console.log("Pulling remote changes...");
				await this.remote.pull();
				let merged=this.merge({
					local: this.local.getValue(),
					remote: this.remote.getValue(),
					ancestor: this.ancestor.getValue()
				});

				this.ancestor.setValue(this.remote.getValue());
				this.ancestor.setVersion(this.remote.getVersion());
				this.local.setValue(merged);
			}

			let localValue=this.local.getValue();
			if (enablePush &&
					!this.compare(localValue,this.ancestor.getValue())) {
				console.log("Local changes, pushing...");
				//console.log(localValue);
				//console.log(this.ancestor.getValue());
				let pushResult=await this.remote.setValue(localValue);

				if (pushResult) {
					this.ancestor.setValue(this.remote.getValue());
					this.ancestor.setVersion(this.remote.getVersion());

					if (this.subscribe)
						this.subscribe.notifyPushed();
				}

				else {
					this.needPull=true;
				}
			}
		} while (this.needPull);
	}

	async init({init, sync}) {
		let promises=[];
		promises.push(this.remote.init());
		if (this.subscribe)
			promises.push(this.subscribe.init());

		await Promise.all(promises);

		if (!this.ancestor.getVersion()) {
			if (!init)
				throw new Error("No local ancestry");

			console.log("Initializing local ancestry...");
			this.local.setValue(this.remote.getValue());
			this.ancestor.setValue(this.remote.getValue());
			this.ancestor.setVersion(this.remote.getVersion());
		}

		else {
			if (sync) {
				console.log("Local ancestry on init, doing initial merge...");
				let merged=this.merge({
					local: this.local.getValue(),
					remote: this.remote.getValue(),
					ancestor: this.ancestor.getValue()
				});

				this.ancestor.setValue(this.remote.getValue());
				this.ancestor.setVersion(this.remote.getVersion());
				this.local.setValue(merged);
			}
		}

		if (sync)
			await this.sync();
	}

	notifyRemoteChange(version) {
		/*if (!version)
			throw new Error("notifyRemoteChange: No version!!! ");*/

		if (!version || version>this.remote.getVersion()) {
			this.needPull=true;
			this.syncDebounce.trigger();
		}
	}

	notifyLocalChange() {
		this.syncDebounce.trigger();
	}

	async close() {
		if (this.subscribe)
			await this.subscribe.close();
	}
}