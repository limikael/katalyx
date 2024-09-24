export class DeclaredError extends Error {
	constructor(...args) {
		super(...args);
		this.declared=true;
	}
}

export function arrayDifference(a, b) {
	return a.filter(item=>!b.includes(item));	
}

export function arrayIntersection(a, b) {
	return a.filter(item=>b.includes(item));	
}

export function arrayUnique(a) {
	function onlyUnique(value, index, array) {
		return array.indexOf(value) === index;
	}

	return a.filter(onlyUnique);
}
