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

function isPlainObject(value) {
    if (!value)
        return false;

    if (value.constructor===Object)
        return true;

    if (value.constructor.toString().includes("Object"))
        return true;

    return false;
}

export function objectifyArgs(params, fields) {
    let conf={}, i=0;

    for (let param of params) {
        if (isPlainObject(param))
            conf={...conf,...param};

        else
        	conf[fields[i++]]=param;
    }

    return conf;
}

export function arrayify(a) {
	if (Array.isArray(a))
		return a;

	if (a===undefined)
		return [];

	return [a];
}
