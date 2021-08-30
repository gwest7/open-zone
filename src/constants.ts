
export enum SystemErrorCode {
  NoError = "000",
  BufferOverrun = "001",
  BufferOverflow = "002",
  TransmitBufferOverflow = "003",
  KeybusTransmitBufferOverrun = "010",
	KeybusTransmitTimeTimeout = "011",
	KeybusTransmitModeTimeout = "012",
	KeybusTransmitKeystringTimeout = "013",
	KeybusInterfaceNotFunctioning = "014",
	KeybusBusy = "015",
	KeybusBusyLockout = "016",
	KeybusBusyInstallersMode = "017",
	KeybusBusyGeneralBusy = "018",
	APICommandSyntaxError = "020",
	APICommandPartitionError = "021",
	APICommandNotSupported = "022",
	APISystemNotArmed = "023",
	APISystemNotReadytoArm = "024",
	APICommandInvalidLength = "025",
	APIUserCodeNotRequired = "026",
	APIInvalidCharactersinCommand = "027",
}

export const systemErrorMsg = new Map<SystemErrorCode,string>([
  [SystemErrorCode.NoError, "No error."],
  [SystemErrorCode.BufferOverrun, "Receive Buffer Overrun (a command is received while another is still being processed)."],
  [SystemErrorCode.BufferOverflow, "Receive Buffer Overflow."],
  [SystemErrorCode.TransmitBufferOverflow, "Transmit Buffer Overflow."],
  [SystemErrorCode.KeybusTransmitBufferOverrun, "Keybus Transmit Buffer Overrun."],
  [SystemErrorCode.KeybusTransmitTimeTimeout, "Keybus Transmit Time Timeout."],
  [SystemErrorCode.KeybusTransmitModeTimeout, "Keybus Transmit Mode Timeout."],
  [SystemErrorCode.KeybusTransmitKeystringTimeout, "Keybus Transmit Keystring Timeout."],
  [SystemErrorCode.KeybusInterfaceNotFunctioning, "Keybus Interface Not Functioning (the TPI cannot communicate with the security system)."],
  [SystemErrorCode.KeybusBusy, "Keybus Busy (Attempting to Disarm or Arm with user code)."],
  [SystemErrorCode.KeybusBusyLockout, "Keybus Busy – Lockout (The panel is currently in Keypad Lockout – too many disarm attempts)."],
  [SystemErrorCode.KeybusBusyInstallersMode, "Keybus Busy – Installers Mode (Panel is in installers mode: return  most functions are unavailable)."],
  [SystemErrorCode.KeybusBusyGeneralBusy, "Keybus Busy – General Busy (The requested partition is busy)."],
  [SystemErrorCode.APICommandSyntaxError, "API Command Syntax Error"],
  [SystemErrorCode.APICommandPartitionError, "API Command Partition Error (Requested Partition is out of bounds)"],
  [SystemErrorCode.APICommandNotSupported, "API Command Not Supported"],
  [SystemErrorCode.APISystemNotArmed, "API System Not Armed (sent in response to a disarm command)"],
  [SystemErrorCode.APISystemNotReadytoArm, "API System Not Ready to Arm (system is either not-secure, in exit-delay, or already armed)"],
  [SystemErrorCode.APICommandInvalidLength, "API Command Invalid Length"],
  [SystemErrorCode.APIUserCodeNotRequired, "API User Code not Required"],
  [SystemErrorCode.APIInvalidCharactersinCommand, "API Invalid Characters in Command (no alpha characters are allowed except for checksum)"],
]);

export enum DataLoginResponse {
	Fail = '0',
	Success = '1',
	Timeout = '2',
	Required = '3',
}

export enum ApplicationCommand {
	Poll = '000',
	StatusReport = '001',
	NetworkLogin = '005',
	DumpZoneTimers = '008',
	PartitionArmControl = '030',
	PartitionArmControlStayArm = '031',
	PartitionArmControlNoEntryDelay = '032',
	PartitionArmControlWithCode = '033',
	PartitionDisarmControl = '040',
	TriggerPanicAlarm = '060', // 1 = Fire, 2 = Ambulance, 3 = Police
}

export enum TPICommand {
	CommandAcknowledge = '500',
	CommandError = '501',
	SystemError = '502',
	LoginResponse = '505',
	KeypadLEDState = '510',
	KeypadLEDFlashState = '511',
	TimeDateBroadcast = '550',
	ZoneAlarm = '601',
	ZoneAlarmRestored = '602',
	ZoneTamper = '603',
	ZoneTamperRestored = '604',
	ZoneFault = '605',
	ZoneFaultRestored = '606',
	ZoneOpen = '609',
	ZoneRestored = '610',
	ZoneTimerDump = '615',
	BypassZonesBitfieldDump = '616',
	DuressAlarm = '620',
	KeyAlarmActivated = '621',
	KeyAlarmRestored = '622',
	KeyAuxillaryActivated = '623',
	KeyAuxillaryRestored = '624',
	KeyPanicActivated = '625',
	KeyPanicRestored = '626',
	KeySmokeActivated = '631',
	KeySmokeRestored = '632',
	PartitionReady = '650',
	PartitionNotReady = '651',
	PartitionArmed = '652',
	PartitionReadyForceArmingEnabled = '653',
	PartitionInAlarm = '654',
	PartitionDisarmed = '655',
	ExitDelayInProgress = '656',
	EntryDelayInProgress = '657',
	PartitionFailedToArm = '659',
	FailureToArm = '672',
	PartitionIsBusy = '673',
	SystemArmingInProgress = '674',
	TroubleLedOn = '840',
	TroubleLedOff = '841',
	VerboseTroubleStatus = '849',
}

export enum PartitionCommand {
  ArmStay = 'arm-stay',
  Arm = 'arm',
  Disarm = 'disarm',
}

export enum PanicType {
  Fire = 'fire',
  Ambulance = 'ambulance',
  Police = 'police',
}

export enum ZoneActivityType {
	Alarm = 'alarm',
	Tamper = 'tamper',
	Fault = 'fault',
	Normal = 'normal',
}

// #####################################
//   PARTITION
// #####################################

export enum PartitionActivityType {
	NotReady = 'not-ready', // open zone

	Ready = 'ready',
	DisarmedAndReady = 'disarmed', // -> ready
	ReadyForceArmingEnabled = 'ready-fa', // open zone, but ready to arm

	Arming = 'arming', // rare state
	ArmFailed = 'arm-failed', // when attempting to arm while a zone is open
	ExitDelay = 'exit-delay', // -> armed-* (sometimes skipped when delay is short)
	
	ArmedAway = 'armed-away',
	ArmedStay = 'armed-stay',
	ArmedZeroEntryAway = 'armed-ze-away', // alarm ->
	ArmedZeroEntryStay = 'armed-ze-stay', // alarm ->
	
	EntryDelay = 'entry-delay', // -> disarmed/ready
	
	Alarm = 'alarm', // zone opened on armed partition
	Busy = 'busy', // eg: inactive partition
}

export enum PartitionStateChange {
	Disarm = 'disarm',
	Arm = 'arm',
	ArmStay = 'stay', // with entry delay always?
	ArmZeroEnrtyDelay = 'arm-zed',
}

export interface IPartitionActivity {
	id: string;
	type: PartitionActivityType;
}

export const getDescription = (id:string|number) => {
  const str = `${id}`;
  switch (str) {
		case "1": return "Inside";
		case "2": return "Outside";
		default: return `Partition ${str}`;
	}
}
