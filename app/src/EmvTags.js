'use strict';

const tlv = require('tlv');
const hexify = require('hexify');

let emvTags = {
    '4F': 'APP_IDENTIFIER',
    '50': 'APP_LABEL',
    '57': 'TRACK_2',
    '5A': 'PAN',
    '5F20': 'CARDHOLDER_NAME',
    '5F24': 'APP_EXPIRY',
    '5F25': 'APP_EFFECTIVE',
    '5F28': 'ISSUER_COUNTRY_CODE',
    '5F2A': 'TRANSACTION_CURRENCY_CODE',
    '5F2D': 'LANGUAGE_PREFERENCE',
    '5F30': 'SERVICE_CODE',
    '5F34': 'PAN_SEQUENCE_NUMBER',
    '5F36': 'TRANSACTION_CURRENCY_EXPONENT',
    '5F50': 'ISSUER_URL',
    '61': 'APPLICATION_TEMPLATE',
    '6F': 'FILE_CONTROL_log',
    '70': 'EMV_APP_ELEMENTARY_FILE',
    '71': 'ISSUER_SCRIPT_TEMPLATE_1',
    '72': 'ISSUER_SCRIPT_TEMPLATE_2',
    '77': 'RESPONSE_TEMPLATE_2',
    '80': 'RESPONSE_TEMPLATE_1',
    '81': 'AUTH_AMOUNT_BIN',
    '82': 'APP_INTERCHANGE_PROFILE',
    '83': 'COMMAND_TEMPLATE',
    '84': 'DEDICATED_FILE_NAME',
    '86': 'ISSUER_SCRIPT_CMD',
    '87': 'APP_PRIORITY',
    '88': 'SFI',
    '89': 'AUTH_IDENTIFICATION_RESPONSE',
    '8A': 'AUTH_RESPONSE_CODE',
    '8C': 'CDOL_1',
    '8D': 'CDOL_2',
    '8E': 'CVM_LIST',
    '8F': 'CA_PK_INDEX',
    '90': 'ISSUER_PK_CERTIFICATE',
    '91': 'ISSUER_AUTH_DATA',
    '92': 'ISSUER_PK_REMAINDER',
    '93': 'SIGNED_STATIC_APPLICATION_DATA',
    '94': 'APP_FILE_LOCATOR',
    '95': 'TERMINAL_VERIFICATION_RESULTS',
    '98': 'TC_HASH_VALUE',
    '99': 'TRANSACTION_PIN_DATA',
    '9A': 'TRANSACTION_DATE',
    '9B': 'TRANSACTION_STATUS_logRMATION',
    '9C': 'TRANSACTION_TYPE',
    '9D': 'DIRECTORY_DEFINITION_FILE',
    '9F01': 'ACQUIRER_ID',
    '9F02': 'AUTH_AMOUNT_NUM',
    '9F03': 'OTHER_AMOUNT_NUM',
    '9F04': 'OTHER_AMOUNT_BIN',
    '9F05': 'APP_DISCRETIONARY_DATA',
    '9F06': 'AID_TERMINAL',
    '9F07': 'APP_USAGE_CONTROL',
    '9F08': 'APP_VERSION_NUMBER',
    '9F09': 'APP_VERSION_NUMBER_TERMINAL',
    '9F0D': 'IAC_DEFAULT',
    '9F0E': 'IAC_DENIAL',
    '9F0F': 'IAC_ONLINE',
    '9F10': 'ISSUER_APPLICATION_DATA',
    '9F11': 'ISSUER_CODE_TABLE_IDX',
    '9F12': 'APP_PREFERRED_NAME',
    '9F13': 'LAST_ONLINE_ATC',
    '9F14': 'LOWER_OFFLINE_LIMIT',
    '9F15': 'MERCHANT_CATEGORY_CODE',
    '9F16': 'MERCHANT_ID',
    '9F17': 'PIN_TRY_COUNT',
    '9F18': 'ISSUER_SCRIPT_ID',
    '9F1A': 'TERMINAL_COUNTRY_CODE',
    '9F1B': 'TERMINAL_FLOOR_LIMIT',
    '9F1C': 'TERMINAL_ID',
    '9F1D': 'TRM_DATA',
    '9F1E': 'IFD_SERIAL_NUM',
    '9F1F': 'TRACK_1_DD',
    '9F21': 'TRANSACTION_TIME',
    '9F22': 'CA_PK_INDEX_TERM',
    '9F23': 'UPPER_OFFLINE_LIMIT',
    '9F26': 'APPLICATION_CRYPTOGRAM',
    '9F27': 'CRYPTOGRAM_logRMATION_DATA',
    '9F2D': 'ICC_PIN_ENCIPHERMENT_PK_CERT',
    '9F32': 'ISSUER_PK_EXPONENT',
    '9F33': 'TERMINAL_CAPABILITIES',
    '9F34': 'CVM_RESULTS',
    '9F35': 'APP_TERMINAL_TYPE',
    '9F36': 'APP_TRANSACTION_COUNTER',
    '9F37': 'APP_UNPREDICATABLE_NUMBER',
    '9F38': 'ICC_PDOL',
    '9F39': 'POS_ENTRY_MODE',
    '9F3A': 'AMOUNT_REF_CURRENCY',
    '9F3B': 'APP_REF_CURRENCY',
    '9F3C': 'TRANSACTION_REF_CURRENCY_CODE',
    '9F3D': 'TRANSACTION_REF_CURRENCY_EXPONENT',
    '9F40': 'ADDITIONAL_TERMINAL_CAPABILITIES',
    '9F41': 'TRANSACTION_SEQUENCE_COUNTER',
    '9F42': 'APP_CURRENCY_CODE',
    '9F43': 'APP_REF_CURRENCY_EXPONENT',
    '9F44': 'APP_CURRENCY_EXPONENT',
    '9F45': 'DATA_AUTH_CODE',
    '9F46': 'ICC_PK_CERTIFICATE',
    '9F47': 'ICC_PK_EXPONENT',
    '9F48': 'ICC_PK_REMAINDER',
    '9F49': 'DDOL',
    '9F4A': 'STATIC_DATA_AUTHENTICATION_TAG_LIST',
    '9F4C': 'ICC_DYNAMIC_NUMBER',
    'A5': 'FCI_TEMPLATE',
    'BF0C': 'FCI_ISSUER_DD'
};


function toString(data) {
    const value = data.value;
    let decoded = '\n';
    if (Buffer.isBuffer(value)) {
        decoded = value.toString() + ' ' + value.toString('hex');
    }
    let str = '' + data.tag.toString(16) + ' (' + emvTags[data.tag.toString(16).toUpperCase()] + ') ' + decoded;
    if (data.value && Array.isArray(data.value)) {
        data.value.forEach(function (child) {
            str += '\t' + toString(child);
        });
    }
    str += '\n';
    return str;
}


function find(tlv, tag, arr) {
    console.log(`Find [0x${tag.toString(16)}]`);
    if (tlv.tag === tag) {
        arr.push(tlv);
        console.log(`\tMatch !!`);
        return arr;
    } else if (tlv.value && Array.isArray(tlv.value)) {
        console.log(`\tCheck ${tlv.value.length} children`);
        for (let i = 0; i < tlv.value.length; i++) {
            find(tlv.value[i], tag, arr);
        }
        console.log(`\t${tlv.value.length} Children checked`);
    } else {
        console.log(`\tNo match [${tlv.tag}]`);
    }
    return arr;
}


function findFirst(tlv, tag) {
    console.log(`Find [0x${tag.toString(16)}]`);
    if (tlv.tag === tag) {
        console.log(`\tMatch !!`);
        return tlv;
    } else if (tlv.value && Array.isArray(tlv.value)) {
        console.log(`\tCheck ${tlv.value.length} children`);
        for (let i = 0; i < tlv.value.length; i++) {
            var result = findFirst(tlv.value[i], tag);
            if (result) {
                return result;
            }
        }
        console.log(`\t${tlv.value.length} Children checked`);
    } else {
        console.log(`\tNo match [${tlv.tag}]`);
    }
}


module.exports = {
    findTags: function findTags(tlv, tag) {
        var found = find(tlv, tag, []);
        console.log(`findTags '${found}'`);
        return found
    },

    findTag: function findTag(tlv, tag) {
        var found = findFirst(tlv, tag);
        console.log(`findTag '${found}'`);
        return found
    },

    format: function format(response) {
        return toString(tlv.parse(response.buffer));
    },

    formatTlv: function formatTlv(tlv) {
        return toString(tlv);
    }
}