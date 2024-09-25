import path from "path";
import {arrayDifference} from "./js-util.js";

export function getFileOps(current, wanted) {
	let res={};

	for (let fn of arrayDifference(Object.keys(current),Object.keys(wanted))) {
		res[fn]=undefined;
	}

	for (let fn of Object.keys(wanted)) {
		if (current[fn]!=wanted[fn])
			res[fn]=wanted[fn];
	}

	return res;
}