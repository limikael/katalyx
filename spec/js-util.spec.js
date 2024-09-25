import {objectifyArgs} from "../src/utils/js-util.js";

describe("js-uil",()=>{
	it("can objectify args",()=>{
		let conf;

		conf=objectifyArgs(["name",{world: "test"}],["hello","2nd"]);
		//console.log(conf);
		expect(conf).toEqual({hello: 'name', world: 'test' });

		conf=objectifyArgs(["name",{x: 5},"test"],["hello","2nd"]);
		//console.log(conf);
		expect(conf).toEqual({ hello: 'name', x: 5, '2nd': 'test' });
	});
});