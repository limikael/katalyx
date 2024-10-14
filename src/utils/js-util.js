export class DeclaredError extends Error {
	constructor(...args) {
		super(...args);
		this.declared=true;
	}
}

export function arrayify(a) {
	if (Array.isArray(a))
		return a;

	if (a===undefined)
		return [];

	return [a];
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

export function arrayUnique(a) {
	function onlyUnique(value, index, array) {
		return array.indexOf(value) === index;
	}

	return a.filter(onlyUnique);
}

export function arrayDifference(a, b) {
	return a.filter(item=>!b.includes(item));	
}

export function arrayIntersection(a, b) {
	return a.filter(item=>b.includes(item));	
}

export class ResolvablePromise extends Promise {
	constructor(cb = () => {}) {
        let resolveClosure = null;
        let rejectClosure = null;

		super((resolve,reject)=>{
            resolveClosure = resolve;
            rejectClosure = reject;

			return cb(resolve, reject);
		});

        this.resolveClosure = resolveClosure;
        this.rejectClosure = rejectClosure;
 	}

	resolve=(result)=>{
		this.resolveClosure(result);
	}

	reject=(reason)=>{
		this.rejectClosure(reason);
	}
}

export function objectEq(a,b) {
	if (Array.isArray(a) && Array.isArray(b)) {
		if (a.length!=b.length)
			return false;

		return a.every((dep, idx) => objectEq(dep, b[idx]));
	}

	if (isPlainObject(a) && isPlainObject(b)) {
		let aKeys=Object.keys(a);
		let bKeys=Object.keys(b);

		aKeys.sort();
		bKeys.sort();

		if (!objectEq(aKeys,bKeys))
			return false;

		for (let key of aKeys)
			if (!objectEq(a[key],b[key]))
				return false;

		return true;
	}

	return (a==b);
}
