// Export all node components
export { EISPotentiostaticNode } from './eis-potentiostatic.node';
export { EISGalvanostaticNode } from './eis-galvanostatic.node';
export { OCPMeasurementNode } from './ocp-measurement.node';
export { ChronoamperometryNode } from './chronoamperometry.node';
export { ChronopotentiometryNode } from './chronopotentiometry.node';
export { VoltageRampNode } from './voltage-ramp.node';
export { CurrentRampNode } from './current-ramp.node';
export { LSVMeasurementNode } from './lsv-measurement.node';
export { LoopStartNodeComponent } from './loop-start.node';
export { LoopEndNodeComponent } from './loop-end.node';
export { WaitDelayNode } from './wait-delay.node';

// Node type mapping
export const NODE_COMPONENTS = {
  'eis_potentiostatic': () => import('./eis-potentiostatic.node').then(m => m.EISPotentiostaticNode),
  'eis_galvanostatic': () => import('./eis-galvanostatic.node').then(m => m.EISGalvanostaticNode),
  'ocp_measurement': () => import('./ocp-measurement.node').then(m => m.OCPMeasurementNode),
  'chronoamperometry': () => import('./chronoamperometry.node').then(m => m.ChronoamperometryNode),
  'chronopotentiometry': () => import('./chronopotentiometry.node').then(m => m.ChronopotentiometryNode),
  'voltage_ramp': () => import('./voltage-ramp.node').then(m => m.VoltageRampNode),
  'current_ramp': () => import('./current-ramp.node').then(m => m.CurrentRampNode),
  'lsv_measurement': () => import('./lsv-measurement.node').then(m => m.LSVMeasurementNode),
  'loop_start': () => import('./loop-start.node').then(m => m.LoopStartNodeComponent),
  'loop_end': () => import('./loop-end.node').then(m => m.LoopEndNodeComponent),
  'wait_delay': () => import('./wait-delay.node').then(m => m.WaitDelayNode),
};

// Node component registry
export const NODE_REGISTRY = {
  eis_potentiostatic: 'EISPotentiostaticNode',
  eis_galvanostatic: 'EISGalvanostaticNode',
  ocp_measurement: 'OCPMeasurementNode',
  chronoamperometry: 'ChronoamperometryNode',
  chronopotentiometry: 'ChronopotentiometryNode',
  voltage_ramp: 'VoltageRampNode',
  current_ramp: 'CurrentRampNode',
  lsv_measurement: 'LSVMeasurementNode',
  loop_start: 'LoopStartNodeComponent',
  loop_end: 'LoopEndNodeComponent',
  wait_delay: 'WaitDelayNode',
};

// Helper function to get node component by type
export async function getNodeComponent(type: string) {
  const componentLoader = NODE_COMPONENTS[type as keyof typeof NODE_COMPONENTS];
  if (!componentLoader) {
    throw new Error(`Unknown node type: ${type}`);
  }
  return componentLoader();
}

// Node type validation
export function isValidNodeType(type: string): type is keyof typeof NODE_COMPONENTS {
  return type in NODE_COMPONENTS;
}

// Node type list
export const AVAILABLE_NODE_TYPES = Object.keys(NODE_COMPONENTS) as Array<keyof typeof NODE_COMPONENTS>;