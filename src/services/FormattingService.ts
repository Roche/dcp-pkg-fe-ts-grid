import type { GridService } from "../GridService";
import { Column, DisplayValue, Row } from "../types/grid";
import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { logger } from "@open-dcp/utilities";

function formatInTimeZone(
    timestamp: number | Date,
    timeZone: string,
    formatString: string
): string {
    const date = typeof timestamp === "number" ? new Date(timestamp) : timestamp;
    const zonedDate = toZonedTime(date, timeZone);
    return format(zonedDate, formatString);
}

export class FormattingService {
    private readonly gridService: GridService;

    constructor(gridService: GridService) {
        this.gridService = gridService;
    }

    applyFormattingToRow(row: Row): Row {
        const columns = this.gridService.getColumns();
        const formattedRow: Row = { ...row };  // Clone the row to keep it immutable

        if (columns && columns.length > 0) {
            // Columns are ready, proceed with formatting
            columns.forEach((column: Column) => {
                const cellData = row[column.key] ?? null;

                const rawValue = cellData && typeof cellData === 'object' && 'raw' in cellData
                    ? cellData.raw
                    : cellData;

                const value = this.formatCellValue(row, column);

                // Store raw and value
                formattedRow[column.key] = {
                    raw: rawValue,           // Ensure raw value stays the same
                    value: value,       // Store transformed value for sorting/filtering
                };
            });
        } else {
            Object.keys(row).forEach(key => {
                formattedRow[key] = {
                    raw: row[key],   // Use original value as raw
                    value: null,  // No transformation yet
                };
            });

            //logger.warn('Columns are not available yet. Row formatting is deferred.');
        }

        return formattedRow;
    }

    private formatCustomCell(cellValue: any, row: Row, column: Column): DisplayValue {
        let displayValue: string | undefined = undefined;
        let renderedElement: HTMLElement | undefined = undefined;
        if (typeof column.renderCell === 'function') {
            try {
                const functionReturn: string | HTMLElement = column.renderCell(cellValue, row);
                if (functionReturn instanceof HTMLAnchorElement) {
                    renderedElement = functionReturn;
                } else if (typeof functionReturn == "string") {
                    displayValue = functionReturn;
                }
            } catch (error) {
                logger.error(`Error in custom renderCell function for column ${column.key}:`, error);
                displayValue = 'Error';
            }
        } else {
            logger.warn(`Custom column type requires a renderCell function.`);
            displayValue = 'N/A';
        }
        return { display: displayValue, renderedElement };
    }

    private formatDateCell(cellValue: any, column: Column): string {
        const date = new Date(cellValue);
        let dateFormatString = this.gridService.displayFormatSubject.getValue().dateFormat;
        if (column.type === 'datetime') {
            dateFormatString += ` ${this.gridService.displayFormatSubject.getValue().timeFormat}`;
        }
        return formatInTimeZone(
            date,
            this.gridService.displayFormatSubject.getValue().timeZone,
            dateFormatString
        );
    }

    formatCellDisplay(row: Row, column: Column): DisplayValue {
        const cellValue: any = row[column.key]?.value ?? null;
        if (cellValue === null) {
            return { display: null, renderedElement: undefined };
        }

        let displayValue: string | undefined = undefined;
        let renderedElement: HTMLElement | undefined = undefined;

        if (typeof column.transformer === 'function') {
            try {
                const transformed = column.transformer(cellValue);
                displayValue = transformed != null ? transformed.toString() : '';
                return { display: displayValue, renderedElement };
            } catch (error) {
                logger.error(`Error in transformer for column ${column.key}:`, error);
                return { display: 'Error', renderedElement };
            }
        }

        try {
            switch (column.type) {
                case 'component':
                    break;
                case 'custom':
                    return this.formatCustomCell(cellValue, row, column);
                case 'integer':
                case 'number':
                    displayValue = cellValue.toString();
                    break;
                case 'date':
                case 'datetime':
                    displayValue = this.formatDateCell(cellValue, column);
                    break;
                case 'duration':
                    displayValue = `${Math.floor(cellValue / 3600).toString().padStart(2, '0')}:${Math.floor((cellValue % 3600) / 60).toString().padStart(2, '0')}:${(cellValue % 60).toString().padStart(2, '0')}`;
                    break;
                case 'string':
                default:
                    displayValue = cellValue.toString();
                    break;
            }
        } catch (error) {
            logger.error(`Error formatting cell for column ${column.key}:`, error);
            displayValue = 'Error';
        }

        return { display: displayValue, renderedElement };
    }

    private transformCustomOrComponent(rawValue: any, column: Column): any {
        if (typeof column.transformer === 'function') {
            try {
                return column.transformer(rawValue);
            } catch (error) {
                logger.error(`Error in custom transformer function for column ${column.key}:`, error);
                return 'Error';
            }
        }
        return rawValue;
    }

    private transformInteger(rawValue: any): number | null {
        return rawValue !== null ? parseInt(rawValue, 10) : null;
    }

    private transformNumber(rawValue: any): number | null {
        return rawValue !== null ? parseFloat(rawValue) : null;
    }

    private transformDate(rawValue: any): number | null {
        if (rawValue !== null) {
            const date = new Date(rawValue);
            return isNaN(date.getTime()) ? null : date.getTime();
        }
        return null;
    }

    private transformDuration(rawValue: any): number | null {
        return rawValue !== null ? parseInt(rawValue, 10) : null;
    }

    private transformString(rawValue: any): string | null {
        return rawValue !== null ? rawValue.toString() : null;
    }

    formatCellValue(row: Row, column: Column): any {
        // Safely retrieve the raw value
        const cellData = row[column.key] ?? null;
        const rawValue: any = cellData && typeof cellData === 'object' && 'raw' in cellData
            ? cellData.raw
            : cellData;

        switch (column.type) {
            case 'component':
            case 'custom':
                return this.transformCustomOrComponent(rawValue, column);
            case 'integer':
                return this.transformInteger(rawValue);
            case 'number':
                return this.transformNumber(rawValue);
            case 'date':
            case 'datetime':
                return this.transformDate(rawValue);
            case 'duration':
                return this.transformDuration(rawValue);
            case 'string':
            default:
                return this.transformString(rawValue);
        }
    }
}
