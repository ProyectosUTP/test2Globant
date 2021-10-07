var uploadEstimates = (function ( $, rateCard, toastr, Papa ) {
    var $fileInput;

    //Validate estimate uploads for ADVISOR side rules before saving.
    var validateEstimateUpload = function (estimates) {
        rateCard.ajax({
            url: rateCard.applicationUrl + '/api/pricingEstimates/validateUpload',
            data: JSON.stringify(estimates),
            type: 'POST',
            done: function (validationData) {
                if (!validationData.IsValid) {
                    var errorDialog = $('<ul style="list-style: circle; margin-left: 10px;"></ul>')
                        .text('One or more of the following AdVisor validations failed. Upload cannot be completed.');
                    _.forEach(JSON.parse(validationData.ValidationErrors.OneStandardAdvisorValidationMessage), function (x) {
                        errorDialog.append($('<li style="margin: 5px 0;"></li>').text(x));
                    });
                    // remove the permanent warning toast we displayed above
                    $('#toast-container').empty();
                    toastr.error(errorDialog, null, { showAsHtml: true });
                }

                var validationMessage = '';
                if (validationData.IsValid &&
                    validationData.ValidationMessages.hasOwnProperty("UploadSuccess")) {
                    validationMessage = validationData.ValidationMessages.UploadSuccess;
                    // remove the permanent warning toast we displayed above
                    $('#toast-container').empty();
                    toastr.success(validationMessage);
                } else if (validationData.IsValid) {
                    if (validationData.ValidationMessages.hasOwnProperty("WorkingDraftFoundMessage")
                    ) {
                        validationMessage = validationData.ValidationMessages
                            .WorkingDraftFoundMessage;
                    } else if (validationData.ValidationMessages.hasOwnProperty("UploadConfirm")) {
                        validationMessage = validationData.ValidationMessages.UploadConfirm;
                    }

                    $('#toast-container').empty();
                    //Get confirmation before saving by showing appropriate validation message.
                    if (window.confirm(validationMessage)) {
                        toastr.info("Upload  is in progress.",
                            null,
                            {
                                tapToDismiss: false,
                                extendedTimeOut: 0,
                                timeOut: 0
                            });

                        //After confirmation save the validated estimate uploads.
                        uploadEstimate();
                    }
                }
            },
            validationFail: function (jqXHR) {
                //Error responseText is an array of error messages.
                var serverErrors = JSON.parse(jqXHR.responseText);
                // remove the permanent warning toast we displayed above
                $('#toast-container').empty();
                toastr.error(serverErrors);
            }
        }).then(function () {
            $fileInput.val('');
        });
    };

    //After confirmation save the validated estimate uploads.
    var uploadEstimate = function (estimates) {
        rateCard.ajax({
            url: rateCard.applicationUrl + '/api/pricingEstimates/upload',
            data: JSON.stringify(estimates),
            type: 'POST',
            done: function (uploadSuccess) {
                // remove the permanent warning toast we displayed above
                $('#toast-container').empty();
                toastr.success(uploadSuccess[0]);
            },
            validationFail: function (jqXHR) {
                //Error responseText is an array of error messages.
                var serverErrors = JSON.parse(jqXHR.responseText);
                var errorDialog = $('<ul style="list-style: circle; margin-left: 10px;"></ul>').text('Estimate upload failed:');
                _.forEach(serverErrors, function (x) {
                    errorDialog.append($('<li style="margin: 5px 0;"></li>').text(x));
                });
                // remove the permanent warning toast we displayed above
                $('#toast-container').empty();
                toastr.error(errorDialog, null, { showAsHtml: true });
            }
        }).then(function () {
            $fileInput.val('');
            rateCard.mask.remove();
        });
    }

    //Convert to server side estimate Dto (SaveEstimateDto).
    var convertToDto = function (nonDemoColumns, headerData, row) {
        var rowEstimate = {
            Id: null,
            ConcurrencyVersion: null,
            Rate: null,
            Comments: null,
            DeliveryStream: row[nonDemoColumns.DeliveryStream],
            SellingRotationId: row[nonDemoColumns.SellingRotationId],
            RatecardId: row[nonDemoColumns.RatecardId],
            Quarter: { QuarterNumber: row[nonDemoColumns.Quarter], Year: row[nonDemoColumns.Year] },
            BaseDemographics: []
        };
        _.forEach(headerData, function (header) {
            if (!_.contains(_.values(nonDemoColumns), header)) {
                rowEstimate.BaseDemographics.push({
                    Code: header,
                    Impressions: row[header],
                    Ota: null
                });
            }
        });
        return rowEstimate;
    };

    //Validate file content(client side) before converting to server side estimate Dto (SaveEstimateDto).
    var validateFileContents = function (nonDemoColumns, rows, headerData) {
        var isValid = true,
            validHeader = /^[a-zA-Z0-9\-\+]+$/,
            validChars = /^[a-zA-Z0-9]+$/,
            validNum = /^[0-9]+$/,
            fileErrors = [],
            validationError = ["One or more required fields for Header row is blank",
                "One or more required fields for SR/Qtr row is blank",
                "Invalid characters were found",
                "Duplicate rows found",
                "Commas not allowed",
                "Past quarters not allowed"];

        //Header column check.                                                        
        _.forEach(headerData, function (header) {
            if (header === null || header.toString() === '' || header.toString().length <= 0) {
                fileErrors.push(validationError);
            }
            if (header !== null && header.toString().length > 0 && !validHeader.test(header)) {
                fileErrors.push(validationError);
            }
            _.forEach(nonDemoColumns, function (column) {
                if (!_.contains(headerData, column)) {
                    fileErrors.push(validationError);
                }
            });
        });

        //Duplicate row check
        _.each(_.groupBy(rows, function (r) {
            return [r[nonDemoColumns.SellingRotationId], r[nonDemoColumns.Quarter], r[nonDemoColumns.Year],
            r[nonDemoColumns.DeliveryStream], r[nonDemoColumns.RatecardId]].sort();
        }), function (group) {
            if (group.length > 1) {
                fileErrors.push(validationError);
            }
        });

        //Rows data check.      
        _.forEach(rows, function (row) {
            _.forEach(row, function (value, column) {
                if (value === null || value.toString() === '' || value.toString().length <= 0) {
                    fileErrors.push(validationError);
                }
                //Ignore string column in Number check (DeliveryStream :Columns = [3])                                   
                if (column !== nonDemoColumns.DeliveryStream) {
                    if (value !== null && value.toString().length > 0 && !validNum.test(value.toString())) {
                        fileErrors.push(validationError);
                    }
                } else {
                    if (value !== null && value.toString().length > 0 && !validChars.test(value.toString())) {
                        fileErrors.push(validationError);
                    }
                }
            });

            //Check to allow Current & Future Quarters only.
            var quarterYear = currQtr.split('Q/');
            if (row.YEAR < parseInt(quarterYear[1], 10) || (row.QTR < parseInt(quarterYear[0], 10) && row.YEAR <= parseInt(quarterYear[1], 10))) {
                fileErrors.push(validationError);
            }
        });

        if (fileErrors.length > 0) {
            isValid = false;
            var uniqFileErrors = _.uniq(fileErrors);
            var errorDialog = $('<ul style="list-style: circle; margin-left: 10px;"></ul>').text('One or more of the following File validations failed. Upload cannot be completed.');
            _.forEach(uniqFileErrors[0], function (e) {
                errorDialog.append($('<li style="margin: 5px 0;"></li>').text(e));
            });
            toastr.error(errorDialog, null, { showAsHtml: true });
            return isValid;
        }
        return isValid;
    }

    let handleChange = () => {

        var file = $fileInput[0].files[0];
        if (file.name.indexOf(".csv") < 0) {
            toastr.error("CSV file type expected");
            return;
        }

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            dynamicTyping: true,
            complete: function (result) {
                var errors = _.filter(_.uniq(result.errors, 'code'), function (x) {
                    return x.type !== 'FieldMismatch';
                });

                /*
                 * 1. Display any parsing errors (Papa parse)
                 * 2. Validate parsed upload file rows(client side).
                 * 3. Convert parsed uplod file rows to server side estimate Dto (SaveEstimateDto).
                 * 4. Validate estimate uploads for ADVISOR side rules before saving.
                 * 5. If any Working Draft exists then get a confirmation to overwrite those.
                 * 6. If NO errors, NO working drafts then save upload estimates, no confirmation asked.
                 * 7. Display the status of the Upload at the end either with Success(green toast) or Failure(red toast) and remove the 'Upload Progress'(Blue toast). 
                 */
                if (errors.length > 0) {
                    var errorList = $('<ul style="list-style: circle; margin-left: 10px;"></ul>').text('Unable to read file:');
                    _.forEach(errors, function (x) {
                        errorList.append($('<li style="margin: 5px 0;"></li>').text(x.message));
                    });
                    toastr.error(errorList, null, { showAsHtml: true });
                }
                else {
                    var dataArray = result.data,
                        headerData = _.keys(dataArray[0]);

                    const nonDemoColumns = {
                        SellingRotationId: "SRID",
                        Quarter: "QTR",
                        Year: "YEAR",
                        DeliveryStream: "STREAM",
                        RatecardId: 'RATECARDID'
                    };

                    //Validate file content(client side) before converting to server side estimate Dto (SaveEstimateDto).
                    if (validateFileContents(nonDemoColumns, dataArray, headerData)) {
                        var estimates = _.map(dataArray, function (row) {
                            return convertToDto(nonDemoColumns, headerData, row);
                        });

                        toastr.info("Upload is in progress.", null, {
                            tapToDismiss: false, extendedTimeOut: 0, timeOut: 0
                        });

                        //Validate estimate uploads for ADVISOR side rules before saving.
                        //validateEstimateUpload(estimates);
                    }
                }
                $fileInput.val('');
            }
        });

    }

    const initialize = function (options) {

        var settings = $.extend({}, options);

        if (!settings.selector) {
            throw new Error('upload module needs file input.');
        }

        $fileInput = $(settings.selector);

        $fileInput
            .off('change')
            .on('change', handleChange);

    };

    var openFileSelector = function () {
        if ( $fileInput ) {
            $fileInput.click();
        } else {
            throw new Error( 'upload module has not been initialized.' );
        }
    };

    const testingOnly = {
        $fileInput,
        validateEstimateUpload,
        uploadEstimate,
        convertToDto,
        validateFileContents,
        handleChange
    };

    testingOnly.override = {
        $fileInput: (mock) => $fileInput = mock,
        validateEstimateUpload: (mock) => validateEstimateUpload = mock,
        uploadEstimate: (mock) => uploadEstimate = mock,
        convertToDto: (mock) => convertToDto = mock,
        validateFileContents: (mock) => validateFileContents = mock,
        handleChange: (mock) => handleChange = mock
    };

    testingOnly.restore = (memberName) => {
        let memberNames = Object.getOwnPropertyNames(testingOnly)
            .filter(name => name !== 'override' && name !== 'restore');

        if (memberName) {
            memberNames = [memberName];
        }

        memberNames.forEach(name => {
            const originalValue = testingOnly[name];
            testingOnly.override[name](originalValue);
        });
    };

    return {
        initialize: initialize,
        openFileSelector: openFileSelector,
        testingOnly: testingOnly
    };

}(jQuery, rateCard, toastr, Papa));



var uploadEstimatesWithPricePeriod = (function ($, rateCard, toastr, Papa) {
    var $fileInput;

    //Validate estimate uploads for ADVISOR side rules before saving.
    var validateEstimateUpload = function (estimates) {
        rateCard.ajax({
            url: rateCard.applicationUrl + '/api/pricingEstimates/validateUpload',
            data: JSON.stringify(estimates),
            type: 'POST',
            done: function (validationData) {
                if (!validationData.IsValid) {
                    var errorDialog = $('<ul style="list-style: circle; margin-left: 10px;"></ul>').text('One or more of the following AdVisor validations failed. Upload cannot be completed.');
                    _.forEach(JSON.parse(validationData.ValidationErrors.OneStandardAdvisorValidationMessage), function (x) {
                        errorDialog.append($('<li style="margin: 5px 0;"></li>').text(x));
                    });
                    // remove the permanent warning toast we displayed above
                    $('#toast-container').empty();
                    toastr.error(errorDialog, null, { showAsHtml: true });
                }

                var validationMessage = '';
                if (validationData.IsValid &&
                    validationData.ValidationMessages.hasOwnProperty("UploadSuccess")) {
                    validationMessage = validationData.ValidationMessages.UploadSuccess;
                    // remove the permanent warning toast we displayed above
                    $('#toast-container').empty();
                    toastr.success(validationMessage);
                } else if (validationData.IsValid) {
                    if (validationData.ValidationMessages.hasOwnProperty("WorkingDraftFoundMessage")) {
                        validationMessage = validationData.ValidationMessages.WorkingDraftFoundMessage;
                    } else if (validationData.ValidationMessages.hasOwnProperty("UploadConfirm")) {
                        validationMessage = validationData.ValidationMessages.UploadConfirm;
                    }

                    $('#toast-container').empty();
                    //Get confirmation before saving by showing appropriate validation message.
                    if (window.confirm(validationMessage)) {
                        toastr.info("Upload  is in progress.",
                            null,
                            {
                                tapToDismiss: false,
                                extendedTimeOut: 0,
                                timeOut: 0
                            });

                        //After confirmation save the validated estimate uploads.
                        uploadEstimate(estimates);
                    }
                }
            },
            validationFail: function (jqXHR) {
                //Error responseText is an array of error messages.
                var serverErrors = JSON.parse(jqXHR.responseText);
                // remove the permanent warning toast we displayed above
                $('#toast-container').empty();
                toastr.error(serverErrors);
            }
        }).then(function () {
            $fileInput.val('');
        });
    };

    //After confirmation save the validated estimate uploads.
    var uploadEstimate = function (estimates) {
        rateCard.ajax({
            url: rateCard.applicationUrl + '/api/pricingEstimates/upload',
            data: JSON.stringify(estimates),
            type: 'POST',
            done: function (uploadSuccess) {
                // remove the permanent warning toast we displayed above
                $('#toast-container').empty();
                toastr.success(uploadSuccess[0]);
            },
            validationFail: function (jqXHR) {
                //Error responseText is an array of error messages.
                var serverErrors = JSON.parse(jqXHR.responseText);
                var errorDialog = $('<ul style="list-style: circle; margin-left: 10px;"></ul>').text('Estimate upload failed:');
                _.forEach(serverErrors, function (x) {
                    errorDialog.append($('<li style="margin: 5px 0;"></li>').text(x));
                });
                // remove the permanent warning toast we displayed above
                $('#toast-container').empty();
                toastr.error(errorDialog, null, { showAsHtml: true });
            }
        }).then(function () {
            $fileInput.val('');
            rateCard.mask.remove();
        });
    }

    //Convert to server side estimate Dto (SaveEstimateDto).
    var convertToDto = function (nonDemoColumns, headerData, row) {
        var rowEstimate = {
            Id: null,
            ConcurrencyVersion: null,
            Rate: null,
            Comments: null,
            DeliveryStream: row[nonDemoColumns.DeliveryStream],
            SellingRotationId: row[nonDemoColumns.SellingRotationId],
            RatecardId: row[nonDemoColumns.RatecardId],
            //Quarter: { QuarterNumber: row[nonDemoColumns.Quarter], Year: row[nonDemoColumns.Year] },
            PricePeriod: { YearNumber: row[nonDemoColumns.Year], QuarterNumber: row[nonDemoColumns.Quarter], Name: row[nonDemoColumns.PPName] },
            BaseDemographics: []
        };
        _.forEach(headerData, function (header) {
            if (!_.contains(_.values(nonDemoColumns), header)) {
                rowEstimate.BaseDemographics.push({
                    Code: header,
                    Impressions: row[header],
                    Ota: null
                });
            }
        });
        return rowEstimate;
    };

    //Validate file content(client side) before converting to server side estimate Dto (SaveEstimateDto).
    var validateFileContents = function (nonDemoColumns, rows, headerData) {

        var isValid = true,
            validHeader = /^[a-z A-Z0-9\-\+]+$/,
            validChars = /^[a-zA-Z0-9]+$/,
            validPPNameChars = /^[a-z A-Z0-9)(]+$/,
            validNum = /^[0-9]+$/,
            fileErrors = [],
            validationErrors = ["The column names for these column indexes ({column indexes separated by comma}) have a null or empty value in the header",
                                "The column names for these column indexes ({column indexes separated by comma}) have a special character in the header",
                                "There are missing non demographic columns ({missing column names separated by comma})",
                                "There are {number of rows} rows for the combination of these values: selling rotation id ({Sr id value}), quarter ({quarter value}), year ({year value}), ppname ({ppname value}), delivery stream ({stream value}) and ratecard id ({ratecard id value})",
                                "For these columns ({columns separated by comma}) values are null in this row: {rows values / row index}",
                                "For these numeric columns ({columns separated by comma}) values contain characters in this row: {rows values / row index}",
                                "For the Delivery Stream column values contain special characters in this row: {rows values / row index}",
                                "For the Price Period Name column values contain not allowed characters in this row: {rows values / row index}",
                                "For the quarter / year columns values are less than the current quarter / year in this row: {rows values / row index}"];


        //Header column check.  
        var nullOrEmptyHeaderIndexes = [];
        var headerWithSpetialCharactersIndexes = [];
        var missingNonDemographicHeaderNames = [];
        for (var i = 0; i < headerData.length; i++) {
            if (headerData[i] === null || headerData[i].toString() === '' || headerData[i].toString().length <= 0) {
                nullOrEmptyHeaderIndexes.push(i);
            }
            if (headerData[i] && headerData[i].toString().length > 0 && !validHeader.test(headerData[i])) {
                headerWithSpetialCharactersIndexes.push(i);
            }
        }

        _.forEach(nonDemoColumns, function (columnValue, columnKey) {
            if (!_.contains(headerData, columnValue)) {
                missingNonDemographicHeaderNames.push(columnValue);
            }
        });

        if (nullOrEmptyHeaderIndexes.length > 0) {
            fileErrors.push(validationErrors[0].replace("{column indexes separated by comma}", nullOrEmptyHeaderIndexes.toString()));
        }

        if (headerWithSpetialCharactersIndexes.length > 0) {
            fileErrors.push(validationErrors[1].replace("{column indexes separated by comma}", headerWithSpetialCharactersIndexes.toString()));
        }

        if (missingNonDemographicHeaderNames.length > 0) {
            fileErrors.push(validationErrors[2].replace("{missing column names separated by comma}", missingNonDemographicHeaderNames.toString()));
        }

        //Duplicate row check
        _.each(_.groupBy(rows, function (r) {
            return [r[nonDemoColumns.SellingRotationId], r[nonDemoColumns.Quarter], r[nonDemoColumns.Year], r[nonDemoColumns.PPName], r[nonDemoColumns.DeliveryStream], r[nonDemoColumns.RatecardId]].sort();
        }), function (group) {
            if (group.length > 1) {
                fileErrors.push(validationErrors[3].replace("{number of rows}", group.length).replace("{Sr id value}", group[0][nonDemoColumns.SellingRotationId])
                    .replace("{quarter value}", group[0][nonDemoColumns.Quarter]).replace("{year value}", group[0][nonDemoColumns.Year])
                    .replace("{ppname value}", group[0][nonDemoColumns.PPName]).replace("{stream value}", group[0][nonDemoColumns.DeliveryStream])
                    .replace("{ratecard id value}", group[0][nonDemoColumns.RatecardId]));
            }
        });

        for (let i = 0; i < rows.length; i++) {
            var nullOrEmptyRowErrors = [],
                deliveryStreamFormatRowErrors = [],
                ppNameFormatRowErrors = [],
                numberFormatRowErrors = [];
            _.forEach(rows[i], function (value, column) {
                if (value === null || value.toString() === '' || value.toString().length <= 0) {
                    if (column !== nonDemoColumns.PPName)
                        nullOrEmptyRowErrors.push(column);
                }
                //Ignore string column in Number check (DeliveryStream :Columns = [3])                                   
                if (column === nonDemoColumns.DeliveryStream) {
                    if (value && value.toString().length > 0 && !validChars.test(value.toString())) {
                        deliveryStreamFormatRowErrors.push(column);
                    }
                } else if (column === nonDemoColumns.PPName) {
                    if (value && value.toString().length > 0 && !validPPNameChars.test(value.toString())) {
                        ppNameFormatRowErrors.push(column);
                    }
                } else {
                    if (value && value.toString().length > 0 && !validNum.test(value.toString())) {
                        numberFormatRowErrors.push(column);
                    }
                }
            });

            if (nullOrEmptyRowErrors.length > 0) {
                fileErrors.push(validationErrors[4].replace("{columns separated by comma}", nullOrEmptyRowErrors.toString()).replace("{rows values / row index}", i + 1));
            }

            if (numberFormatRowErrors.length > 0) {
                fileErrors.push(validationErrors[5].replace("{columns separated by comma}", numberFormatRowErrors.toString()).replace("{rows values / row index}", i + 1));
            }

            if (deliveryStreamFormatRowErrors.length > 0) {
                fileErrors.push(validationErrors[6].replace("{rows values / row index}", i + 1));
            }

            if (ppNameFormatRowErrors.length > 0) {
                fileErrors.push(validationErrors[7].replace("{rows values / row index}", i + 1));
            }

            //Check to allow Current & Future Quarters only.
            var quarterYear = currQtr.split('Q/');
            if (rows[i].YEAR < parseInt(quarterYear[1], 10) || (rows[i].QTR < parseInt(quarterYear[0], 10) && rows[i].YEAR <= parseInt(quarterYear[1], 10))) {
                fileErrors.push(validationErrors[8].replace("{rows values / row index}", i + 1));
            }
        }

        if (fileErrors.length > 0) {
            isValid = false;
            var uniqFileErrors = _.uniq(fileErrors);
            var errorDialog = $('<ul style="list-style: circle; margin-left: 10px;"></ul>').text('One or more of the following File validations failed. Upload cannot be completed.');
            _.forEach(uniqFileErrors, function (e) {
                errorDialog.append($('<li style="margin: 5px 0;"></li>').text(e));
            });
            toastr.error(errorDialog, null, { showAsHtml: true });
            return isValid;
        }
        return isValid;
    }

    let handleChange = () => {

        var file = $fileInput[0].files[0];
        if (file.name.indexOf(".csv") < 0) {
            toastr.error("CSV file type expected");
            return;
        }

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            dynamicTyping: true,
            complete: function (result) {
                var errors = _.filter(_.uniq(result.errors, 'code'), function (x) {
                    return x.type !== 'FieldMismatch';
                });

                /*
                 * 1. Display any parsing errors (Papa parse)
                 * 2. Validate parsed upload file rows(client side).
                 * 3. Convert parsed uplod file rows to server side estimate Dto (SaveEstimateDto).
                 * 4. Validate estimate uploads for ADVISOR side rules before saving.
                 * 5. If any Working Draft exists then get a confirmation to overwrite those.
                 * 6. If NO errors, NO working drafts then save upload estimates, no confirmation asked.
                 * 7. Display the status of the Upload at the end either with Success(green toast) or Failure(red toast) and remove the 'Upload Progress'(Blue toast). 
                 */
                if (errors.length > 0) {
                    var errorList = $('<ul style="list-style: circle; margin-left: 10px;"></ul>').text('Unable to read file:');
                    _.forEach(errors, function (x) {
                        errorList.append($('<li style="margin: 5px 0;"></li>').text(x.message));
                    });
                    toastr.error(errorList, null, { showAsHtml: true });
                }
                else {
                    var dataArray = result.data,
                        headerData = _.keys(dataArray[0]);

                    const nonDemoColumns = {
                        SellingRotationId: "SRID",
                        Quarter: "QTR",
                        Year: "YEAR",
                        PPName: "PRICE PERIOD NAME",
                        DeliveryStream: "STREAM",
                        RatecardId: 'RATECARDID'
                    };

                    //Validate file content(client side) before converting to server side estimate Dto (SaveEstimateDto).
                    if (validateFileContents(nonDemoColumns, dataArray, headerData)) {
                        var estimates = _.map(dataArray, function (row) {
                            return convertToDto(nonDemoColumns, headerData, row);
                        });

                        toastr.info("Upload is in progress.", null, {
                            tapToDismiss: false, extendedTimeOut: 0, timeOut: 0
                        });

                        //Validate estimate uploads for ADVISOR side rules before saving.
                        //validateEstimateUpload(estimates);
                    }
                }
                $fileInput.val('');
            }
        });

    }

    const initialize = function (options) {

        var settings = $.extend({}, options);

        if (!settings.selector) {
            throw new Error('upload module needs file input.');
        }

        $fileInput = $(settings.selector);

        $fileInput
            .off('change')
            .on('change', handleChange);

    };

    const openFileSelector = function () {
        if ($fileInput) {
            $fileInput.click();
        } else {
            throw new Error('upload module has not been initialized.');
        }
    };

    const testingOnly = {
        $fileInput,
        validateEstimateUpload,
        uploadEstimate,
        convertToDto,
        validateFileContents,
        handleChange
    };

    testingOnly.override = {
        $fileInput: (mock) => $fileInput = mock,
        validateEstimateUpload: (mock) => validateEstimateUpload = mock,
        uploadEstimate: (mock) => uploadEstimate = mock,
        convertToDto: (mock) => convertToDto = mock,
        validateFileContents: (mock) => validateFileContents = mock,
        handleChange: (mock) => handleChange = mock
    };

    testingOnly.restore = (memberName) => {
        let memberNames = Object.getOwnPropertyNames(testingOnly)
            .filter(name => name !== 'override' && name !== 'restore');

        if (memberName) {
            memberNames = [memberName];
        }

        memberNames.forEach(name => {
            const originalValue = testingOnly[name];
            testingOnly.override[name](originalValue);
        });
    };

    return {
        initialize: initialize,
        openFileSelector: openFileSelector,
        testingOnly: testingOnly
    };

}(jQuery, rateCard, toastr, Papa));


