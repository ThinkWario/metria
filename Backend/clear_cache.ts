import { invalidateWorkspaceCache } from './src/middleware/cache';

async function main() {
    console.log('Clearing workspace cache...');
    try {
        await invalidateWorkspaceCache('d6b9d6e1-95be-4bca-843e-df3c519bd7bd');
        console.log('Cache cleared successfully.');
    } catch (e) {
        console.error('Failed to clear cache:', e);
    }
}
main();
