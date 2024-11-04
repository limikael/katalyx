import {mergeBinFile, mergeFileTrees} from "../src/collab/merge-util.js";
import fs from "fs";
import path from "path";
import {mkdirParent} from "../src/utils/fs-util.js";

describe("merge-util",()=>{
	it("can merge binary files",async ()=>{
		await fs.promises.rm("tmp/merge-test",{recursive: true, force: true});
		await fs.promises.mkdir("tmp/merge-test/local",{recursive: true});
		await fs.promises.writeFile("tmp/merge-test/local/test1","hello");

		await fs.promises.cp("tmp/merge-test/local","tmp/merge-test/remote",{recursive: true});
		await fs.promises.cp("tmp/merge-test/local","tmp/merge-test/ancestor",{recursive: true});

		await fs.promises.writeFile("tmp/merge-test/remote/test1","hello2");
		//await fs.promises.writeFile("tmp/merge-test/local/test1","hello3");

		await mergeBinFile({
			local: "tmp/merge-test/local",
			ancestor: "tmp/merge-test/ancestor",
			remote: "tmp/merge-test/remote",
			name: "test1",
			resolve: "local",
			fs: fs
		});

		expect(await fs.promises.readFile("tmp/merge-test/local/test1","utf8")).toEqual("hello2");
		expect(await fs.promises.readFile("tmp/merge-test/ancestor/test1","utf8")).toEqual("hello2");
	});

	it("can merge",async ()=>{
		async function initFiles(dir, files) {
			await fs.promises.rm(dir,{recursive: true, force: true});
			for (let fn in files) {
				await mkdirParent(path.join(dir,fn),{fs:fs});
				await fs.promises.writeFile(path.join(dir,fn),files[fn]);
			}
		}

		let baseDir="tmp/merge2";

		await initFiles(path.join(baseDir,"local"),{
			"remotechange.txt": "bla",
			"both/create.txt": "blu",
			"merged.txt": "first\nlocal change\nmiddle\nlast"
		});

		await initFiles(path.join(baseDir,"ancestor"),{
			"remotechange.txt": "bla",
			"merged.txt": "first\nmiddle\nlast"
		});

		await initFiles(path.join(baseDir,"remote"),{
			"new/in/subdir/test.txt": "blabla",
			"remotechange.txt": "blanew",
			"both/create.txt": "bli",
			"merged.txt": "first\nmiddle\nremote change\nlast"
		});

		await mergeFileTrees({
			local: path.join(baseDir,"local"),
			ancestor: path.join(baseDir,"ancestor"),
			remote: path.join(baseDir,"remote"),
			fs: fs,
			resolve: "remote"
		});

		expect(await fs.promises.readFile(path.join(baseDir,"local/remotechange.txt"),"utf8")).toEqual("blanew");
		expect(await fs.promises.readFile(path.join(baseDir,"local/new/in/subdir/test.txt"),"utf8")).toEqual("blabla");
		expect(await fs.promises.readFile(path.join(baseDir,"ancestor/new/in/subdir/test.txt"),"utf8")).toEqual("blabla");
		expect(await fs.promises.readFile(path.join(baseDir,"ancestor/both/create.txt"),"utf8")).toEqual("bli");
		expect(await fs.promises.readFile(path.join(baseDir,"local/both/create.txt"),"utf8")).toEqual("bli");
		expect(await fs.promises.readFile(path.join(baseDir,"local/merged.txt"),"utf8")).toEqual("first\nlocal change\nmiddle\nremote change\nlast");
	});
});
