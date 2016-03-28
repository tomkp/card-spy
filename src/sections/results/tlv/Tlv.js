'use strict';
import React from 'react';

import './tlv.scss';

import tlv from 'tlv';
import hexify from 'hexify';

let emvTags = {
    '4F': 'APP IDENTIFIER',
    '50': 'APP LABEL',
    '57': 'TRACK 2',
    '5A': 'PAN',
    '5F20': 'CARDHOLDER NAME',
    '5F24': 'APP EXPIRY',
    '5F25': 'APP EFFECTIVE',
    '5F28': 'ISSUER COUNTRY CODE',
    '5F2A': 'TRANSACTION CURRENCY CODE',
    '5F2D': 'LANGUAGE PREFERENCE',
    '5F30': 'SERVICE CODE',
    '5F34': 'PAN SEQUENCE NUMBER',
    '5F36': 'TRANSACTION CURRENCY EXPONENT',
    '5F50': 'ISSUER URL',
    '61': 'APPLICATION TEMPLATE',
    '6F': 'FILE CONTROL log',
    '70': 'EMV APP ELEMENTARY FILE',
    '71': 'ISSUER SCRIPT TEMPLATE 1',
    '72': 'ISSUER SCRIPT TEMPLATE 2',
    '77': 'RESPONSE TEMPLATE 2',
    '80': 'RESPONSE TEMPLATE 1',
    '81': 'AUTH AMOUNT BIN',
    '82': 'APP INTERCHANGE PROFILE',
    '83': 'COMMAND TEMPLATE',
    '84': 'DEDICATED FILE NAME',
    '86': 'ISSUER SCRIPT CMD',
    '87': 'APP PRIORITY',
    '88': 'SFI',
    '89': 'AUTH IDENTIFICATION RESPONSE',
    '8A': 'AUTH RESPONSE CODE',
    '8C': 'CDOL 1',
    '8D': 'CDOL 2',
    '8E': 'CVM LIST',
    '8F': 'CA PK INDEX',
    '90': 'ISSUER PK CERTIFICATE',
    '91': 'ISSUER AUTH DATA',
    '92': 'ISSUER PK REMAINDER',
    '93': 'SIGNED STATIC APPLICATION DATA',
    '94': 'APP FILE LOCATOR',
    '95': 'TERMINAL VERIFICATION RESULTS',
    '98': 'TC HASH VALUE',
    '99': 'TRANSACTION PIN DATA',
    '9A': 'TRANSACTION DATE',
    '9B': 'TRANSACTION STATUS logRMATION',
    '9C': 'TRANSACTION TYPE',
    '9D': 'DIRECTORY DEFINITION FILE',
    '9F01': 'ACQUIRER ID',
    '9F02': 'AUTH AMOUNT NUM',
    '9F03': 'OTHER AMOUNT NUM',
    '9F04': 'OTHER AMOUNT BIN',
    '9F05': 'APP DISCRETIONARY DATA',
    '9F06': 'AID TERMINAL',
    '9F07': 'APP USAGE CONTROL',
    '9F08': 'APP VERSION NUMBER',
    '9F09': 'APP VERSION NUMBER TERMINAL',
    '9F0D': 'IAC DEFAULT',
    '9F0E': 'IAC DENIAL',
    '9F0F': 'IAC ONLINE',
    '9F10': 'ISSUER APPLICATION DATA',
    '9F11': 'ISSUER CODE TABLE IDX',
    '9F12': 'APP PREFERRED NAME',
    '9F13': 'LAST ONLINE ATC',
    '9F14': 'LOWER OFFLINE LIMIT',
    '9F15': 'MERCHANT CATEGORY CODE',
    '9F16': 'MERCHANT ID',
    '9F17': 'PIN TRY COUNT',
    '9F18': 'ISSUER SCRIPT ID',
    '9F1A': 'TERMINAL COUNTRY CODE',
    '9F1B': 'TERMINAL FLOOR LIMIT',
    '9F1C': 'TERMINAL ID',
    '9F1D': 'TRM DATA',
    '9F1E': 'IFD SERIAL NUM',
    '9F1F': 'TRACK 1 DD',
    '9F21': 'TRANSACTION TIME',
    '9F22': 'CA PK INDEX TERM',
    '9F23': 'UPPER OFFLINE LIMIT',
    '9F26': 'APPLICATION CRYPTOGRAM',
    '9F27': 'CRYPTOGRAM logRMATION DATA',
    '9F2D': 'ICC PIN ENCIPHERMENT PK CERT',
    '9F32': 'ISSUER PK EXPONENT',
    '9F33': 'TERMINAL CAPABILITIES',
    '9F34': 'CVM RESULTS',
    '9F35': 'APP TERMINAL TYPE',
    '9F36': 'APP TRANSACTION COUNTER',
    '9F37': 'APP UNPREDICATABLE NUMBER',
    '9F38': 'ICC PDOL',
    '9F39': 'POS ENTRY MODE',
    '9F3A': 'AMOUNT REF CURRENCY',
    '9F3B': 'APP REF CURRENCY',
    '9F3C': 'TRANSACTION REF CURRENCY CODE',
    '9F3D': 'TRANSACTION REF CURRENCY EXPONENT',
    '9F40': 'ADDITIONAL TERMINAL CAPABILITIES',
    '9F41': 'TRANSACTION SEQUENCE COUNTER',
    '9F42': 'APP CURRENCY CODE',
    '9F43': 'APP REF CURRENCY EXPONENT',
    '9F44': 'APP CURRENCY EXPONENT',
    '9F45': 'DATA AUTH CODE',
    '9F46': 'ICC PK CERTIFICATE',
    '9F47': 'ICC PK EXPONENT',
    '9F48': 'ICC PK REMAINDER',
    '9F49': 'DDOL',
    '9F4A': 'STATIC DATA AUTHENTICATION TAG LIST',
    '9F4C': 'ICC DYNAMIC NUMBER',
    'A5': 'FCI TEMPLATE',
    'BF0C': 'FCI ISSUER DD'
};

const emvLookup = (tag) => {
    return emvTags[tag.toString(16).toUpperCase()];
};

function leftpad (str, len, ch) {
    str = String(str);
    var i = -1;
    if (!ch && ch !== 0) ch = ' ';
    len = len - str.length;
    while (++i < len) {
        str = ch + str;
    }
    return str;
}

const Tag = ({tag}) => {
    return <div className="tag">
        <span className="description">{emvLookup(tag.toString('16')).toUpperCase()}</span>
        {tag.toString('16')}
    </div>;
};
const Length = ({length}) => {
    return <div className="length">{leftpad(length, 2, '0')}</div>;
};
const Value = ({value}) => {
    return (
        <div className="value">
            <span className="ascii">{value.toString()}</span>
            <span className="hex">{value.toString('hex')}</span>
        </div>
    );
};

const Tlv = ({tlv, index}) => {

    console.log(`<Tlv tlv='${tlv}' index='${index}' /> ${tlv.constructed}`);

    index++;
    const tabs = new Array(index).join('   ');

    if (tlv.constructed) {
        const arr = tlv.value;
        const children =  arr.map(function(child, key) {
            return <Tlv tlv={child} index={index} key={key} />
        });
        return (<div className="tlv">{children}</div>);
    } else {
        const empties =  Array(index).map(function() {
            return (<div className="empty-cell"></div>);
        });
        return (
            <div className="tlv">
                {empties}
                <Tag tag={tlv.tag} />
                <Length length={tlv.originalLength} />
                <Value value={tlv.value} />
            </div>
        );
    }
};

export default ({data}) => {
    var bytes = hexify.toByteArray(data);
    var parsedTlv = tlv.parse(new Buffer(bytes));
    console.log(`parsedTlv ${parsedTlv}`);
    return <Tlv tlv={parsedTlv} index={0} />
};

/*
  <Bytes bytes={bytes} />
  <br />
 */


