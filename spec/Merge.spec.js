import Merge from "../src/utils/Merge.js";
import {getFileOps} from "../src/utils/fs-util.js";

describe("merge",()=>{
	it("can check status",()=>{
		let merge=new Merge({
			ourFiles: {a: "hello world", b: "hello modified", d: "a new file", thefile: "a\nhello1\nline2", remotedel: "a", modremote: "original"},
			originalFiles: {a: "hello world", b: "hello original", c: "deleted", thefile: "a\nhello\nline2", remotedel: "a", modremote: "original"},
			theirFiles: {a: "hello world", b: "hello original", c: "deleted and changed", thefile: "a\nhello\nline2", newremote: "newremote", modremote: "changed"},
		});

		let mergeRes=merge.merge({resolve: "theirs"});
		//console.log(mergeRes);

		//console.log(getFileOps(merge.ourFiles,mergeRes));
		//console.log(getFileOps(merge.originalFiles,mergeRes));
	});
});