import {dirForEach, findFiles} from "../src/utils/dir-util.js";
import fs from "fs";

describe("dir-util",()=>{
	it("can for each dirs",async ()=>{
		console.log("read dir");
		await dirForEach(".",{fs:fs, ignore: ["node_modules",".*","yarn.lock"]},stat=>{
			//console.log(stat.name);
		});
	});

	it("can find all files",async ()=>{
		let files=await findFiles(".",{fs: fs, ignore: ["node_modules",".*","yarn.lock"]});
		console.log(files);

		/*console.log("read dir");
		await dirForEach(".",{fs:fs, ignore: ["node_modules",".*","yarn.lock"]},stat=>{
			//console.log(stat.name);
		});*/
	});
});