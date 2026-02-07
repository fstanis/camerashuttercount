/*
 * Copyright (C) 2001-2004 Mariusz Woloszyn <emsi@ipartners.pl>
 * Copyright (C) 2003-2024 Marcus Meissner <marcus@jet.franken.de>
 * Copyright (C) 2006-2008 Linus Walleij <triad@df.lth.se>
 * Copyright (C) 2007 Tero Saarni <tero.saarni@gmail.com>
 * Copyright (C) 2009-2024 Axel Waggershauser <awagger@web.de>
 * Copyright (C) 2026 Filip Stanis <filip@stanis.me>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 */

const PTP_USB_CLASS = 6;
const PTP_HEADER_SIZE = 12;

const PTP_OC_GetDeviceInfo = 0x1001;
const PTP_OC_OpenSession = 0x1002;
const PTP_OC_CloseSession = 0x1003;
const PTP_OC_GetDevicePropValue = 0x1015;

const PTP_RC_OK = 0x2001;

const PTP_USB_CONTAINER_COMMAND = 0x0001;
const PTP_USB_CONTAINER_DATA = 0x0002;
const PTP_USB_CONTAINER_RESPONSE = 0x0003;

const PTP_VENDOR_CANON = 0x0000000b;
const PTP_VENDOR_FUJI = 0x0000000e;

const PTP_DPC_CANON_EOS_ShutterCounter = 0xd1ac;
const PTP_DPC_CANON_EOS_ShutterReleaseCounter = 0xd167;
const PTP_DPC_FUJI_TotalShotCount = 0xd310;

const PTP_OC_CANON_EOS_SetRemoteMode = 0x9114;
const PTP_OC_CANON_EOS_SetEventMode = 0x9115;
const PTP_OC_CANON_EOS_GetEvent = 0x9116;
const PTP_OC_CANON_EOS_PCHDDCapacity = 0x911a;
const PTP_OC_CANON_EOS_SetRequestOLCInfoGroup = 0x913d;
const PTP_OC_CANON_EOS_RequestDevicePropValue = 0x9127;
const PTP_EC_CANON_EOS_PropValueChanged = 0xc189;
const PTP_RC_SessionAlreadyOpened = 0x201e;

const CAPTURED_PROP_CHANGES = new Set([
  PTP_DPC_CANON_EOS_ShutterCounter,
  PTP_DPC_CANON_EOS_ShutterReleaseCounter,
]);

interface CameraInfo {
  manufacturer: string;
  model: string;
  version: string;
  serial: string;
  shutterCount: number;
}

interface DeviceInfo {
  vendorExtensionId: number;
  manufacturer: string;
  model: string;
  version: string;
  serial: string;
}

interface PropValueChange {
  propCode: number;
  value: number;
}

class PtpDevice {
  private device: USBDevice;
  private inEndpoint: number = 0;
  private outEndpoint: number = 0;
  private transactionId: number = 0;
  private interfaceNumber: number | null = null;

  constructor(device: USBDevice) {
    this.device = device;
  }

  async connect(): Promise<void> {
    await this.device.open();
    if (this.device.configuration === null) {
      await this.device.selectConfiguration(1);
    }

    const interfaceItem = this.device.configuration?.interfaces.find(
      (i) => i.alternate.interfaceClass === PTP_USB_CLASS,
    );

    if (!interfaceItem) {
      throw new Error('No PTP interface found.');
    }

    this.interfaceNumber = interfaceItem.interfaceNumber;
    await this.device.claimInterface(this.interfaceNumber);

    const inEp = interfaceItem.alternate.endpoints.find(
      (e) => e.direction === 'in' && e.type === 'bulk',
    );
    const outEp = interfaceItem.alternate.endpoints.find(
      (e) => e.direction === 'out' && e.type === 'bulk',
    );

    if (!inEp || !outEp) {
      throw new Error('Bulk endpoints not found.');
    }

    this.inEndpoint = inEp.endpointNumber;
    this.outEndpoint = outEp.endpointNumber;
  }

  async close(): Promise<void> {
    try {
      if (this.device.opened && this.interfaceNumber !== null) {
        await this.device.releaseInterface(this.interfaceNumber);
      }
    } catch (e) {
      console.warn('Error releasing interface:', e);
    }
    this.interfaceNumber = null;
    await this.device.close();
  }

  private encodePacket(
    type: number,
    code: number,
    params: number[] = [],
  ): ArrayBuffer {
    const length = PTP_HEADER_SIZE + params.length * 4;
    const buffer = new ArrayBuffer(length);
    const view = new DataView(buffer);

    view.setUint32(0, length, true);
    view.setUint16(4, type, true);
    view.setUint16(6, code, true);
    view.setUint32(8, this.transactionId, true);

    params.forEach((param, index) => {
      view.setUint32(PTP_HEADER_SIZE + index * 4, param, true);
    });

    return buffer;
  }

  public async receiveResponse(): Promise<DataView> {
    const res = await this.device.transferIn(this.inEndpoint, 512);
    if (!res.data || res.data.byteLength < PTP_HEADER_SIZE) {
      throw new Error('Invalid response packet');
    }
    return res.data;
  }

  public async receiveData(): Promise<DataView> {
    let headerRes;
    let headerView;
    for (let i = 0; i < 3; i++) {
      headerRes = await this.device.transferIn(this.inEndpoint, 1024);
      headerView = headerRes.data;
      if (headerView && headerView.byteLength > 0) break;
      await new Promise((r) => setTimeout(r, 10));
    }

    if (!headerView || headerView.byteLength < PTP_HEADER_SIZE) {
      throw new Error(
        `Invalid data packet header. Length: ${headerView ? headerView.byteLength : 'null'}`,
      );
    }

    const length = headerView.getUint32(0, true);
    const type = headerView.getUint16(4, true);

    if (type !== PTP_USB_CONTAINER_DATA) {
      if (type === PTP_USB_CONTAINER_RESPONSE) {
        return headerView;
      }
      throw new Error(`Expected DATA packet, got type 0x${type.toString(16)}`);
    }

    if (headerView.byteLength >= length) {
      return headerView;
    }

    const fullBuffer = new Uint8Array(length);
    fullBuffer.set(
      new Uint8Array(
        headerView.buffer,
        headerView.byteOffset,
        headerView.byteLength,
      ),
      0,
    );

    let offset = headerView.byteLength;
    while (offset < length) {
      const nextChunk = await this.device.transferIn(
        this.inEndpoint,
        length - offset,
      );
      if (!nextChunk.data || nextChunk.data.byteLength === 0) break;
      fullBuffer.set(
        new Uint8Array(
          nextChunk.data.buffer,
          nextChunk.data.byteOffset,
          nextChunk.data.byteLength,
        ),
        offset,
      );
      offset += nextChunk.data.byteLength;
    }

    return new DataView(fullBuffer.buffer);
  }

  async sendCommand(code: number, params: number[] = []): Promise<void> {
    this.transactionId++;
    const buffer = this.encodePacket(PTP_USB_CONTAINER_COMMAND, code, params);
    await this.device.transferOut(this.outEndpoint, buffer);
  }

  async getDeviceInfo(): Promise<DeviceInfo> {
    await this.sendCommand(PTP_OC_GetDeviceInfo);

    const dataPacket = await this.receiveData();

    if (dataPacket.getUint16(4, true) === PTP_USB_CONTAINER_RESPONSE) {
      const respCode = dataPacket.getUint16(6, true);
      throw new Error(`GetDeviceInfo failed: 0x${respCode.toString(16)}`);
    }

    const responsePacket = await this.receiveResponse();
    if (responsePacket.getUint16(6, true) !== PTP_RC_OK) {
      throw new Error('GetDeviceInfo response not OK');
    }

    return this.parseDeviceInfo(dataPacket);
  }

  private parsePtpString(
    view: DataView,
    offset: number,
  ): { text: string; newOffset: number } {
    if (offset >= view.byteLength) return { text: '', newOffset: offset };
    const numChars = view.getUint8(offset);
    if (numChars === 0) return { text: '', newOffset: offset + 1 };

    let str = '';
    for (let i = 0; i < numChars; i++) {
      if (offset + 1 + i * 2 + 2 > view.byteLength) break;
      const charCode = view.getUint16(offset + 1 + i * 2, true);
      if (charCode !== 0) str += String.fromCharCode(charCode);
    }
    return { text: str, newOffset: offset + 1 + numChars * 2 };
  }

  private parseDeviceInfo(view: DataView): DeviceInfo {
    let offset = PTP_HEADER_SIZE;
    const standardVersion = view.getUint16(offset, true);
    offset += 2;
    const vendorExtensionId = view.getUint32(offset, true);
    offset += 4;
    const vendorExtensionVersion = view.getUint16(offset, true);
    offset += 2;

    const vendorExtensionDesc = this.parsePtpString(view, offset);
    offset = vendorExtensionDesc.newOffset;

    const functionalMode = view.getUint16(offset, true);
    offset += 2;

    const opsLen = view.getUint32(offset, true);
    offset += 4;
    offset += opsLen * 2;

    const eventsLen = view.getUint32(offset, true);
    offset += 4;
    offset += eventsLen * 2;

    const propsLen = view.getUint32(offset, true);
    offset += 4;
    offset += propsLen * 2;

    const capsLen = view.getUint32(offset, true);
    offset += 4;
    offset += capsLen * 2;

    const imgsLen = view.getUint32(offset, true);
    offset += 4;
    offset += imgsLen * 2;

    const manufacturer = this.parsePtpString(view, offset);
    offset = manufacturer.newOffset;

    const model = this.parsePtpString(view, offset);
    offset = model.newOffset;

    const deviceVersion = this.parsePtpString(view, offset);
    offset = deviceVersion.newOffset;

    const serialNumber = this.parsePtpString(view, offset);
    offset = serialNumber.newOffset;

    return {
      vendorExtensionId,
      manufacturer: manufacturer.text,
      model: model.text,
      version: deviceVersion.text,
      serial: serialNumber.text,
    };
  }

  async openSession(): Promise<void> {
    this.transactionId = -1;
    await this.sendCommand(PTP_OC_OpenSession, [1]);
    const response = await this.receiveResponse();
    const respCode = response.getUint16(6, true);
    if (respCode !== PTP_RC_OK) {
      if (respCode === PTP_RC_SessionAlreadyOpened) {
        await this.closeSession();
        this.transactionId = -1;
        await this.sendCommand(PTP_OC_OpenSession, [1]);
        const retryResp = await this.receiveResponse();
        if (retryResp.getUint16(6, true) !== PTP_RC_OK) {
          throw new Error(
            `OpenSession failed after retry: 0x${retryResp.getUint16(6, true).toString(16)}`,
          );
        }
        return;
      }
      throw new Error(`OpenSession failed: 0x${respCode.toString(16)}`);
    }
  }

  async closeSession(): Promise<void> {
    await this.sendCommand(PTP_OC_CloseSession);
    await this.receiveResponse();
  }

  async getDevicePropValue(propCode: number): Promise<number | null> {
    console.log(`getDevicePropValue: 0x${propCode.toString(16)}`);
    await this.sendCommand(PTP_OC_GetDevicePropValue, [propCode]);

    const dataPacket = await this.receiveData();
    if (dataPacket.getUint16(4, true) === PTP_USB_CONTAINER_RESPONSE) {
      console.log(
        `getDevicePropValue 0x${propCode.toString(16)} failed with response code 0x${dataPacket.getUint16(6, true).toString(16)}`,
      );
      return null;
    }

    const responsePacket = await this.receiveResponse();
    if (responsePacket.getUint16(6, true) !== PTP_RC_OK) {
      console.log(
        `getDevicePropValue 0x${propCode.toString(16)} response not OK: 0x${responsePacket.getUint16(6, true).toString(16)}`,
      );
      return null;
    }

    console.log(
      `getDevicePropValue 0x${propCode.toString(16)} returned ${dataPacket.byteLength} bytes`,
    );
    if (dataPacket.byteLength >= 16) {
      return dataPacket.getUint32(PTP_HEADER_SIZE, true);
    }
    return null;
  }

  private parseCanonPropChanges(dataView: DataView): PropValueChange[] {
    const changes: PropValueChange[] = [];
    let offset = PTP_HEADER_SIZE;
    const totalLength = dataView.byteLength;

    while (offset + 8 <= totalLength) {
      const size = dataView.getUint32(offset, true);
      const type = dataView.getUint32(offset + 4, true);

      if (size < 8) break;
      if (size == 8 && type == 0) break;
      if (offset + size > totalLength) break;

      if (type === PTP_EC_CANON_EOS_PropValueChanged) {
        const propCode = dataView.getUint32(offset + 8, true);
        const valueOffset = offset + PTP_HEADER_SIZE;
        if (CAPTURED_PROP_CHANGES.has(propCode)) {
          if (size >= 16) {
            const value = dataView.getUint32(valueOffset, true);
            changes.push({ propCode, value });
          }
        }
      }

      offset += size;
    }
    return changes;
  }

  async getCanonPropChanges(): Promise<PropValueChange[]> {
    try {
      await this.sendCommand(PTP_OC_CANON_EOS_GetEvent);
      const data = await this.receiveData();

      if (data.getUint16(4, true) === PTP_USB_CONTAINER_RESPONSE) {
        return [];
      }

      await this.receiveResponse();

      if (data.byteLength <= PTP_HEADER_SIZE) return [];
      return this.parseCanonPropChanges(data);
    } catch (e) {
      console.log(`getCanonEvents error:`, e);
      return [];
    }
  }
}

async function initCanon(ptp: PtpDevice): Promise<void> {
  console.log('Detected Canon. Executing initialization sequence...');
  try {
    console.log('Setting Remote Mode...');
    await ptp.sendCommand(PTP_OC_CANON_EOS_SetRemoteMode, [1]);
    await ptp.receiveResponse();

    console.log('Setting Event Mode...');
    await ptp.sendCommand(PTP_OC_CANON_EOS_SetEventMode, [1]);
    await ptp.receiveResponse();

    console.log('Setting OLC Info Group...');
    await ptp.sendCommand(PTP_OC_CANON_EOS_SetRequestOLCInfoGroup, [0x1fff]);
    await ptp.receiveResponse();

    console.log('Setting PCHDDCapacity...');
    await ptp.sendCommand(
      PTP_OC_CANON_EOS_PCHDDCapacity,
      [0x0fffffff, 0x1000, 0x1],
    );
    await ptp.receiveResponse();
  } catch (e) {
    console.log('Error during Canon initialization:', e);
    throw e;
  }
}

async function drainShutterEvents(ptp: PtpDevice): Promise<number | null> {
  console.log('Draining events...');
  try {
    for (let i = 0; i < 5; i++) {
      const evts = await ptp.getCanonPropChanges();
      const shutterEvt = evts.find(
        (e) =>
          e.propCode === PTP_DPC_CANON_EOS_ShutterCounter ||
          e.propCode === PTP_DPC_CANON_EOS_ShutterReleaseCounter,
      );
      if (shutterEvt) return shutterEvt.value;
      if (evts.length === 0) break;
    }
  } catch (e) {
    console.warn('Error draining events', e);
  }
  return null;
}

async function queryAndPollShutterProp(
  ptp: PtpDevice,
  propCode: number,
): Promise<number | null> {
  console.log(`Querying ShutterCounter (0x${propCode.toString(16)})...`);
  try {
    await ptp.sendCommand(PTP_OC_CANON_EOS_RequestDevicePropValue, [propCode]);
    await ptp.receiveResponse();

    for (let i = 0; i < 5; i++) {
      const evts = await ptp.getCanonPropChanges();
      const evt = evts.find((e) => e.propCode === propCode);
      if (evt) {
        return evt.value;
      }
      await new Promise((r) => setTimeout(r, 200));
    }
  } catch (e) {
    console.log(`Request prop 0x${propCode.toString(16)} error`, e);
  }
  return null;
}

async function getCanonShutterCount(ptp: PtpDevice): Promise<number> {
  let count = await drainShutterEvents(ptp);
  if (count !== null) return count;

  count = await queryAndPollShutterProp(ptp, PTP_DPC_CANON_EOS_ShutterCounter);
  if (count !== null) return count;

  count = await ptp.getDevicePropValue(PTP_DPC_CANON_EOS_ShutterCounter);
  if (count !== null) return count;

  console.log('0xD1AC failed. Querying ShutterReleaseCounter (0xD167)...');
  count = await queryAndPollShutterProp(
    ptp,
    PTP_DPC_CANON_EOS_ShutterReleaseCounter,
  );
  if (count !== null) return count;

  count = await ptp.getDevicePropValue(PTP_DPC_CANON_EOS_ShutterReleaseCounter);
  if (count !== null) return count;

  return -1;
}

async function exitCanon(ptp: PtpDevice): Promise<void> {
  console.log('Exiting Canon session...');
  try {
    await ptp.sendCommand(PTP_OC_CANON_EOS_SetRemoteMode, [1]);
    await ptp.receiveResponse();
  } catch (e) {
    console.warn('Error setting RemoteMode(1) during exit:', e);
  }

  try {
    await ptp.sendCommand(PTP_OC_CANON_EOS_SetEventMode, [0]);
    await ptp.receiveResponse();
  } catch (e) {
    console.warn('Error setting EventMode(0) during exit:', e);
  }
}

export async function getCameraInfo(): Promise<CameraInfo> {
  if (!navigator.usb) {
    throw new Error('WebUSB not supported');
  }

  const device = await navigator.usb.requestDevice({
    filters: [{ classCode: PTP_USB_CLASS }],
  });
  const ptp = new PtpDevice(device);

  try {
    console.log('Connecting...');
    await ptp.connect();
    await ptp.openSession();

    const deviceInfo = await ptp.getDeviceInfo();
    console.log('Device Info:', deviceInfo);

    let shutterCount = -1;
    let vendorId = deviceInfo.vendorExtensionId;

    if (deviceInfo.manufacturer.toLowerCase().includes('canon')) {
      vendorId = PTP_VENDOR_CANON;
    } else if (deviceInfo.manufacturer.toLowerCase().includes('fuji')) {
      vendorId = PTP_VENDOR_FUJI;
    }

    if (vendorId === PTP_VENDOR_CANON) {
      try {
        await initCanon(ptp);
        shutterCount = await getCanonShutterCount(ptp);
      } finally {
        await exitCanon(ptp);
      }
    } else if (vendorId === PTP_VENDOR_FUJI) {
      console.log('Querying Fuji TotalShotCount (0xD310)...');
      const val = await ptp.getDevicePropValue(PTP_DPC_FUJI_TotalShotCount);
      if (val !== null) shutterCount = val;
    }

    if (shutterCount === -1) console.log('Failed to retrieve shutter count.');

    await ptp.closeSession();
    await ptp.close();

    return {
      manufacturer: deviceInfo.manufacturer,
      model: deviceInfo.model,
      version: deviceInfo.version,
      serial: deviceInfo.serial,
      shutterCount: shutterCount,
    };
  } finally {
    await ptp.close();
  }
}
