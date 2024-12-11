import {mergeFileTrees} from "../src/collab/merge-util.js";
import fs from "fs";
import path from "path";

describe("merge util binary",()=>{
	it("can merge file trees",async ()=>{
		let files={
			"tmp/merge-util-bin/local/public/test.bin": "first local change\nmiddle\nend\n",
			"tmp/merge-util-bin/ancestor/public/test.bin": "first\nmiddle\nend\n",
			"tmp/merge-util-bin/remote/public/test.bin": "first\nmiddle\nend remote change\n",

			"tmp/merge-util-bin/local/test.txt": "first local change\nmiddle\nend\n",
			"tmp/merge-util-bin/ancestor/test.txt": "first\nmiddle\nend\n",
			"tmp/merge-util-bin/remote/test.txt": "first\nmiddle\nend remote change\n",
		};

		fs.rmSync("tmp/merge-util-bin",{recursive: true, force: true});

		for (let fn in files) {
			fs.mkdirSync(path.dirname(fn),{recursive: true});
			fs.writeFileSync(fn,files[fn]);
		}

		fs.mkdirSync("tmp/merge-util-bin/local",{recursive: true});

		await mergeFileTrees({
			binPatterns: ["public/**"],
			local: "tmp/merge-util-bin/local",
			ancestor: "tmp/merge-util-bin/ancestor",
			remote: "tmp/merge-util-bin/remote",
			resolve: "remote",
			fs: fs,
		});
	});
});