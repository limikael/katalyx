import mqtt from "mqtt";

export default class SubscribeMqtt {
	constructor({url, username, password, topic}) {
		this.url=url;
		this.username=username;
		this.password=password;
		this.topic=topic;
	}

	async close() {
		await this.mqttClient.endAsync();//true);
	}

	async init() {
		if (!this.syncManager)
			throw new Error("Need sync manager");

		this.mqttClient=await mqtt.connectAsync(this.url,{
			username: this.username,
			password: this.password
		});

		await this.mqttClient.subscribeAsync(this.topic);
		this.mqttClient.on("message",this.handleMessage);

		//this.syncManager.addEventListener("pushed",this.handlePushed);
	}

	handleMessage=(topic, messageJson)=>{
		let message=JSON.parse(messageJson);
		console.log("mqtt: got version notification: "+message.version);
		this.syncManager.notifyRemoteChange(message.version);
	}

	notifyPushed() {
		let message={
			type: "pushedVersion",
			version: this.syncManager.remote.getVersion()
		}

		console.log("Notifying MQTT...");
		this.mqttClient.publish(this.topic,JSON.stringify(message));
	}
}
