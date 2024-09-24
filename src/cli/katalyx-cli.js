#!/usr/bin/env node

import minimist from "minimist";
import KatalyxCli from "./KatalyxCli.js";
import {DeclaredError} from "../utils/js-util.js";

let argv=minimist(process.argv.slice(2));
let katalyxCli=new KatalyxCli(argv);

try {
	switch (argv._[0]) {
		case "clone":
		case "checkout":
			if (argv._.length!=2)
				throw new DeclaredError("Usage: clone <project_id>");
			await katalyxCli.clone(argv._[1]);
			break;

		case "diff":
		case "status":
			await katalyxCli.status(argv);
			break;

		case "pull":
			await katalyxCli.pull(argv);
			break;

		case "push":
		case "sync":
			await katalyxCli.sync(argv);
			break;

		default:
			throw new DeclaredError("Unknown command: "+argv._[0]);
	}
}

catch (e) {
	if (!e.declared)
		throw e;

	console.log(e.message);
}