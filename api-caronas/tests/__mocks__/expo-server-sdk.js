/**
 * MOCK — expo-server-sdk
 *
 * O pacote real é ESM puro (usa `import` em build/ExpoClient.js) e quebra o Jest,
 * que roda com transform vazio (sem Babel). Como o envio de push já é desativado
 * em NODE_ENV=test (ver utils/pushService.js → IS_TEST), basta um stub construível
 * com os métodos usados no require/envio. Mesma estratégia do mock de geocodingService.
 */

class Expo {
    constructor() {}

    static isExpoPushToken() {
        return true;
    }

    chunkPushNotifications(messages) {
        return [messages];
    }

    async sendPushNotificationsAsync() {
        return [];
    }

    chunkPushNotificationReceiptIds(ids) {
        return [ids];
    }

    async getPushNotificationReceiptsAsync() {
        return {};
    }
}

module.exports = { Expo };
