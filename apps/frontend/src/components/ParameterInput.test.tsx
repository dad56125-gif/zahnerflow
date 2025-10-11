import { render, screen, fireEvent } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { ParameterInput } from './ParameterInput'; // Adjusted import path

test('ParameterInput renders correctly and handles changes', () => {
  // Test case 1: Number input
  const handleChangeNumber = vi.fn();
  render(
    <ParameterInput
      label="Voltage"
      type="number"
      value={1.2}
      onChange={handleChangeNumber}
      unit="V"
    />
  );

  const numberInput = screen.getByLabelText(/Voltage/i);
  expect(numberInput).toBeInTheDocument();
  expect(numberInput).toHaveValue(1.2);

  fireEvent.change(numberInput, { target: { value: '1.5' } });
  expect(handleChangeNumber).toHaveBeenCalledWith(1.5);

  // Test case 2: Text input
  const handleChangeText = vi.fn();
  render(
    <ParameterInput
      label="Filename"
      type="text"
      value={"test_file"}
      onChange={handleChangeText}
    />
  );

  const textInput = screen.getByLabelText(/Filename/i);
  expect(textInput).toBeInTheDocument();
  expect(textInput).toHaveValue('test_file');

  fireEvent.change(textInput, { target: { value: 'new_file' } });
  expect(handleChangeText).toHaveBeenCalledWith('new_file');

  // Test case 3: Select input
  const handleChangeSelect = vi.fn();
  const options = [
    { value: 'COUNTER', label: 'Counter' },
    { value: 'DATE_TIME', label: 'Date/Time' },
  ];
  render(
    <ParameterInput
      label="Naming Mode"
      type="select"
      value={"COUNTER"}
      onChange={handleChangeSelect}
      options={options}
    />
  );

  const selectInput = screen.getByLabelText(/Naming Mode/i);
  expect(selectInput).toBeInTheDocument();
  expect(selectInput).toHaveValue('COUNTER');

  fireEvent.change(selectInput, { target: { value: 'DATE_TIME' } });
  expect(handleChangeSelect).toHaveBeenCalledWith('DATE_TIME');

  // Test case 4: Boolean (checkbox) input
  const handleChangeBoolean = vi.fn();
  render(
    <ParameterInput
      label="Enabled"
      type="boolean"
      value={true}
      onChange={handleChangeBoolean}
    />
  );

  const booleanInput = screen.getByLabelText(/Enabled/i);
  expect(booleanInput).toBeInTheDocument();
  expect(booleanInput).toBeChecked();

  fireEvent.click(booleanInput);
  expect(handleChangeBoolean).toHaveBeenCalledWith(false);
});
