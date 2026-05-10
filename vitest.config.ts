import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
	test: {
		poolOptions: {
			workers: {
				wrangler: { configPath: './wrangler.jsonc' },
			},
		},
		globals: true,
		reporter: ['verbose', 'json'],
		outputFile: {
			json: 'coverage/report.json',
		},
		coverage: {
			provider: 'v8',
			reporter: ['text', 'lcov', 'json'],
			exclude: [
				'**/*.d.ts',
				'**/node_modules/**',
				'test/**',
				'src/validation.ts',
			],
		},
	},
});
