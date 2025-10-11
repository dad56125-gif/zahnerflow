type TestFn = () => void | Promise<void>;
export declare function test(name: string, fn: TestFn): void;
export declare function run(): Promise<void>;
export {};
