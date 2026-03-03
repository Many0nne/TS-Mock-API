import { faker } from '@faker-js/faker';
import { FieldConstraint, FieldConstraints } from '../utils/constraintExtractor';
import {
  getStringLengthBounds,
  getNumberBounds,
  getEnumValues,
  getPattern,
} from '../utils/constraintValidator';

/**
 * Generates a constrained string value
 */
export function generateConstrainedString(constraints: FieldConstraint[]): string {
  const enumValues = getEnumValues(constraints);
  if (enumValues && enumValues.length > 0) {
    return faker.helpers.arrayElement(enumValues);
  }

  const pattern = getPattern(constraints);
  if (pattern) {
    // For patterns, try to generate matching string
    return generateStringMatchingPattern(pattern);
  }

  const { min, max } = getStringLengthBounds(constraints);

  // Generate a random string of appropriate length
  const length = faker.number.int({ min, max });
  return faker.string.alphanumeric(length);
}

/**
 * Generates a constrained number value
 */
export function generateConstrainedNumber(constraints: FieldConstraint[]): number {
  const enumValues = getEnumValues(constraints);
  if (enumValues && enumValues.length > 0) {
    return parseInt(faker.helpers.arrayElement(enumValues), 10);
  }

  const { min, max } = getNumberBounds(constraints);
  return faker.number.int({ min, max });
}

/**
 * Generates a string that matches a regex pattern
 */
function generateStringMatchingPattern(pattern: RegExp): string {
  // This is a simplified approach - for complex patterns, we generate a fallback
  try {
    const source = pattern.source;

    // Handle common patterns
    if (source.includes('[a-z]') || source === '[a-z]*') {
      return faker.string.alpha({ length: 10 });
    }
    if (source.includes('[0-9]') || source === '[0-9]*') {
      return faker.string.numeric({ length: 10 });
    }
    if (source.includes('[a-zA-Z0-9]')) {
      return faker.string.alphanumeric({ length: 10 });
    }

    // For email-like patterns
    if (source.includes('@') || source === '^[^@]+@[^@]+\\.[^@]+$') {
      return faker.internet.email();
    }

    // For URL-like patterns
    if (source.includes('http') || source.includes('://')) {
      return faker.internet.url();
    }

    // Fallback: generate alphanumeric string
    return faker.string.alphanumeric(10);
  } catch (error) {
    // Fallback for complex patterns
    return faker.string.alphanumeric(10);
  }
}

/**
 * Applies constraints to generated mock data
 * This function takes intermock-generated data and applies custom constraints
 */
export function applyConstraintsToMock(
  mockData: Record<string, unknown>,
  fieldConstraints: FieldConstraints,
  _knownTypes: Record<string, string> = {}
): Record<string, unknown> {
  const constrained = { ...mockData };

  for (const [fieldName, constraints] of Object.entries(fieldConstraints)) {
    if (fieldName in constrained) {
      const currentValue = constrained[fieldName];
      const fieldConstraintsList = constraints as FieldConstraint[];

      // Determine the type of constraint to apply
      if (fieldConstraintsList.some((c) => c.type.includes('Length') || c.type === 'pattern')) {
        // String-like constraint
        constrained[fieldName] = generateConstrainedString(fieldConstraintsList);
      } else if (fieldConstraintsList.some((c) => c.type === 'min' || c.type === 'max')) {
        // Number-like constraint
        if (typeof currentValue !== 'number') {
          constrained[fieldName] = generateConstrainedNumber(fieldConstraintsList);
        } else {
          // Validate and regenerate if needed
          const value = currentValue as number;
          const minConstraint = fieldConstraintsList.find((c) => c.type === 'min');
          const maxConstraint = fieldConstraintsList.find((c) => c.type === 'max');

          const min = minConstraint ? (minConstraint.value as number) : value;
          const max = maxConstraint ? (maxConstraint.value as number) : value;

          if (value < min || value > max) {
            constrained[fieldName] = generateConstrainedNumber(fieldConstraintsList);
          }
        }
      } else if (fieldConstraintsList.some((c) => c.type === 'enum')) {
        // Enum constraint
        const enumValues = getEnumValues(fieldConstraintsList);
        if (enumValues && enumValues.length > 0) {
          constrained[fieldName] = faker.helpers.arrayElement(enumValues);
        }
      }
    }
  }

  return constrained;
}

/**
 * Generates a value for a field based on its type and constraints
 */
export function generateFieldValue(
  _fieldName: string,
  fieldType: string,
  constraints: FieldConstraint[] = []
): unknown {
  // If we have constraints that hint at the type
  const hasStringConstraints = constraints.some((c) =>
    ['minLength', 'maxLength', 'pattern'].includes(c.type)
  );
  const hasNumberConstraints = constraints.some((c) =>
    ['min', 'max'].includes(c.type)
  );
  const hasEnumConstraints = constraints.some((c) => c.type === 'enum');

  if (hasEnumConstraints) {
    const enumValues = getEnumValues(constraints);
    if (enumValues && enumValues.length > 0) {
      // Try to convert to appropriate type
      const value = faker.helpers.arrayElement(enumValues);
      if (fieldType === 'number') {
        return parseInt(value, 10);
      }
      return value;
    }
  }

  // Generate based on constraints or field type
  if (hasStringConstraints || fieldType === 'string') {
    return generateConstrainedString(constraints);
  }

  if (hasNumberConstraints || ['number', 'int', 'integer'].includes(fieldType)) {
    return generateConstrainedNumber(constraints);
  }

  if (fieldType === 'boolean') {
    return faker.datatype.boolean();
  }

  if (fieldType === 'date' || fieldType === 'Date') {
    return faker.date.recent();
  }

  // Default fallback
  return generateConstrainedString(constraints);
}
