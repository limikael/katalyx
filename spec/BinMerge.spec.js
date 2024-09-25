import BinMerge from "../src/utils/BinMerge.js";

describe("BinMerge",()=>{
	it("can merge binaries",()=>{
		let binMerge=new BinMerge({
			localFiles: {a: "123", b: "newlocal"},
			remoteFiles: {a: "1234"},
			baseFiles: {
				a: {local: "123", remote: "1234"}
			}
		});

		console.log(binMerge.getMergeOps());
	});
})