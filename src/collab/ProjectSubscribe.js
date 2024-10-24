import mqtt from "mqtt";

export default class ProjectSubscribe {
	constructor({rpc, pid, version, onVersion}) {
		this.rpc=rpc;
		this.pid=pid;
		this.version=version;
		this.onVersion=onVersion;

		this.initialized=false;
		this.init();
	}

	async init() {
		let mqttCredentals=await this.rpc.getMqttCredentials();
		//console.log("mqtt",mqttCredentals);

		this.mqttClient=await mqtt.connectAsync(mqttCredentals.url,{
			username: mqttCredentals.username,
			password: mqttCredentals.password
		});

		this.mqttClient.on("message",this.handleMessage);

		await this.mqttClient.subscribeAsync(this.pid);
		this.initialized=true;
	}

	handleMessage=(topic, messageJson)=>{
		let message=JSON.parse(messageJson);
		//console.log("mqtt: got version notification: "+message.version);

		if (message.version>this.version) {
			this.version=message.version;
			this.onVersion(this.version);
		}
	}

	notifyVersion(version) {
		this.version=version;

		if (!this.initialized) {
			console.log("version notification, but not initialized yet");
			return;
		}

		let message={
			type: "pushedVersion",
			version: this.version
		}

		//console.log("publishing",message);
		this.mqttClient.publish(this.pid,JSON.stringify(message),{retain: true});
	}
}
