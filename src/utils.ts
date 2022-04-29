
// ############################################################
//   TYPES
// ############################################################

import { PartitionActivityType, ZoneActivityType } from "./constants";

export type Boolean8X = [boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean];

export type ZonePayload = {
	id: number,
  situation: ZoneActivityType,
  restored: boolean,
  since: number,
  partition?: string,
}

export type PartitionPayload = {
	id: number,
	state: PartitionActivityType,
	since: number,
}

export type IndicatorPayload = {
	id: number,
	state: 0 | 1 | 2,
	since: number,
}

export type TroublePayload = {
	id: number,
	state: boolean,
	since: number,
}


// ############################################################
//   HELPERS
// ############################################################

/**
 * Accodring to the documentation:
 * 
 * The checksum is calculated by adding the hex value of all command and data digits, and
 * truncating the result to 8 bits. The upper and lower nibbles of the result are
 * converted to ASCII characters before sending.
 * 
 * @param payload Command and data combined. "CCC DDD...DDD"
 * @returns A valid checksum to be added to the payload as CKS: "CCC DDD…DDD CKS CR/LF"
 */
export const getChecksum = (payload: string): string => {
	let ascii = 0;
	for (let i = 0; i < payload.length; i++) ascii += payload.charCodeAt(i);
	const s = ascii.toString(16);
	return s.substring(s.length - 2).toUpperCase();
}

export const getBitStates = (data: string):Boolean8X => {
	const out:Boolean8X = [false,false,false,false,false,false,false,false];
	const LEDSBITS = parseInt(data, 16);
	let testBit = 1;
	for (let i = 0; i < out.length; i++) {
		// tslint:disable-next-line:no-bitwise
		out[i] = (LEDSBITS & testBit) === testBit;
		// tslint:disable-next-line:no-bitwise
		testBit = testBit << 1;
	}
	return out;
}

export const log = (...args:any[]) => {
  const d = new Date();
  const p = (n:number) => n>9? n.toString() : `0${n}`;
  const dt = `[${p(d.getFullYear())}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}]`;
  console.log(dt, ...args)
}
