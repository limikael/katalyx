#!/usr/bin/env node

import KatalyxCli from "./KatalyxCli.js";
import {DeclaredError} from "../utils/js-util.js";
import yargs from "yargs/yargs";
import {hideBin} from "yargs/helpers";

let yargsConf=yargs(hideBin(process.argv))
    .option("url",{
        description: "Alternative server origin url.",
	    default: "https://katalyx.io"
    })
    .option("mqtt",{
        description: "Push changes to MQTT.",
	    default: true
    })
    /*.option("api-key",{
        description: "Server api key.",
    })*/
    .option("cwd",{
        description: "Project directory.",
    })
    .option("resolve",{
    	description: "If case of conflict, resolve with 'local' or 'remote'."
    })
    .command("login","Login and store credentials.")
    .command("ls","List projects.")
    .command("whoami","Show current login information.")
    .command("clone <project_id>","Clone project.")
    .command("checkout <project_id>",false)
    .command("status","Show project status.")
    .command("diff",false)
    .command("pull","Pull down remote changes, without uploading local.")
    .command("sync","Sync local and remote changes.")
    .command("push",false)
    .alias("c <project_id>","clone")
    .demandCommand()
    .strict()

let argv=yargsConf.parse();
let katalyxCli=new KatalyxCli(argv);

try {
	switch (argv._[0]) {
		case "clone":
		case "checkout":
			await katalyxCli.clone(argv);
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

		case "whoami":
			await katalyxCli.whoami();
			break;

		case "login":
			await katalyxCli.login();
			break;

		case "ls":
			await katalyxCli.ls();
			break;

		default:
			throw new DeclaredError("Unknown command: "+argv._[0]);
	}
}

catch (e) {
	await katalyxCli.close();

	if (!e.declared)
		throw e;

	console.log(e.message);
}

await katalyxCli.close();
