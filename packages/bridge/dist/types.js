export function isUiToBridgeMessage(value) {
    return Boolean(value && typeof value === 'object' && 'type' in value);
}
