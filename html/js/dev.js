var sdk_keys = [];
var sdk_app = false;

function dev_init(pp, appkey) {
    $('.new-right-content-block').addClass('hidden');
    $('.new-left-menu-link.dev').removeClass('active');
    $('.new-left-submenu').addClass('hidden');
    if (pp === 'dev') {
        $('.new-right-content-block.dev').removeClass('hidden');
        $('.new-left-menu-link.dev').addClass('active');
    }
    else if (pp === 'doc') {
        $('.new-right-content-block.doc').removeClass('hidden');
        $('.new-left-menu-link.doc').addClass('active');
        $('.new-left-submenu').removeClass('hidden');
        $('.new-left-menu-link.preface').addClass('active');
    }
    else if (pp === 'sdk') {
        $('.new-right-content-block.sdk').removeClass('hidden');
        $('.new-left-menu-link.sdk').addClass('active');
        if (u_type) {
            if (appkey) {
                $('.new-right-content-block.sdk').addClass('hidden');
                if (!sdk_app) {
                    loadingDialog.show();
                    load_sdkkeys(function() {
                        loadingDialog.hide();
                        var app = false;
                        for (var i in sdk_keys) {
                            if (appkey === sdk_keys[i]['key']) {
                                sdk_app = sdk_keys[i];
                            }
                        }
                        if (sdk_app) {
                            dev_app();
                        }
                        else {
                            document.location.hash = 'sdk';
                        }
                    });
                }
                else {
                    dev_app();
                }
            }
            else {
                $('.dev-new-appplications-table').addClass('hidden');
                loadingDialog.show();
                load_sdkkeys(function() {
                    loadingDialog.hide();
                    if (sdk_keys.length > 0) {
                        sdk_key_render();
                    }
                    else {
                        $('.dev-new-appplications-table.noapps').removeClass('hidden');
                    }
                });
                $('.dev-new-button.plus-icon').rebind('click', function(e) {
                    if (!localStorage.sdkterms) {
                        $.termsAgree = function() {
                            localStorage.sdkterms = true;
                            $('.dev-new-button.plus-icon').click();
                        };
                        termsDialog(false, 'sdkterms');
                        return false;
                    }
                    else {
                        loadingDialog.show();
                        api_req({
                            a: 'apc'
                        }, {
                            callback: function(res) {
                                loadingDialog.hide();
                                if (typeof res === 'string') {
                                    sdk_keys.push({
                                        'key': res
                                    });
                                    sdk_app = {
                                        'key': res,
                                        'new': 1
                                    };
                                    document.location.hash = 'sdk_' + res;
                                }
                            }
                        });
                    }
                });
            }
        }
        else {
            $('.dev-new-button.plus-icon').rebind('click', function(e) {
                login_txt = 'Please log in to manage your App Keys.';
                document.location.hash = 'login';
            });
        }

        $('.dev-new-button.down-arrow').rebind('click', function(e) {
            if (!localStorage.sdkterms) {
                $.termsAgree = function() {
                    localStorage.sdkterms = true;
                    document.location = 'https://github.com/meganz/sdk';
                };
                termsDialog(false, 'sdkterms');
                return false;
            }
        });
    }
    $('.new-left-menu-link').rebind('click', function() {
        /* jshint -W074 */
        if ($(this).hasClass('dev')) {
            document.location.hash = 'dev';
        }
        else if ($(this).hasClass('doc')) {
            $('.new-left-menu-link.preface').click();
            document.location.hash = 'doc';
        }
        else if ($(this).hasClass('sdk')) {
            document.location.hash = 'sdk';
        }
        else if (!$(this).hasClass('active')) {
            if ($(this).parent().hasClass('new-left-submenu-item')) {
                $(this).parent().parent().find('.new-left-menu-link').removeClass('active');
            }
            else {
                $(this).parent().children('.new-left-menu-link').removeClass('active');
            }
            $(this).parent().children('.new-left-submenu').addClass('hidden');
            $(this).addClass('active');
            if ($(this).hasClass('contains-submenu')) {
                $(this).next('.new-left-submenu').removeClass('hidden');
            }
            var jsp = $('.main-scroll-block').data('jsp');
            if ($(this).hasClass('preface') && jsp) {
                jsp.scrollToY(0, 1);
            }
            else if ($(this).hasClass('model')) {
                jsp.scrollToElement('#doc_5', 1);
            }
            else if ($(this).hasClass('implementation')) {
                jsp.scrollToElement('#doc_6', 1);
            }
            else if ($(this).hasClass('process')) {
                jsp.scrollToElement('#doc_7', 1);
            }
            else if ($(this).hasClass('future')) {
                jsp.scrollToElement('#doc_8', 1);
            }
            else if ($(this).hasClass('method')) {
                jsp.scrollToElement('#doc_10', 1);
            }
            else if ($(this).hasClass('errorcodes')) {
                jsp.scrollToElement('#doc_11', 1);
            }
            else if ($(this).hasClass('underhood')) {
                jsp.scrollToElement('#doc_12', 1);
            }
        }
    });
    mainScroll();
    scrollMenu();
}


function dev_app() {
    $('.radio-txt.key').text(sdk_app.key);

    if (sdk_app.name) {
        $('.dev-new-app-big-icon').text(sdk_app.name);
        $('#app-name').val(sdk_app.name);
    }
    else {
        $('#app-name').val('');
        $('.dev-new-app-big-icon').text('');
    }

    if (sdk_app.site) {
        $('#website').val(sdk_app.site);
    }
    else {
        $('#website').val('');
    }

    if (sdk_app.publisher) {
        $('#publisher-name').val(sdk_app.publisher);
    }
    else {
        $('#publisher-name').val('');
    }

    if (sdk_app.description) {
        $('#appdesc').val(sdk_app.description);
    }
    else {
        $('#appdesc').val('');
    }

    $('.radiodiv').attr('class', 'radiodiv radioOff');
    $('.radiodiv input').attr('class', 'radioOff');

    $('.radiodiv').bind('click', function(e) {
        $('.radiodiv').attr('class', 'radiodiv radioOff');
        $('.radiodiv input').attr('class', 'radioOff');
        $(this).attr('class', 'radiodiv radioOn');
        $(this).find('input').attr('class', 'radioOn');
    });

    if (sdk_app.status > 0) {
        $('#rad2').attr('class', 'radiodiv radioOn');
        $('#rad2 input').attr('class', 'radioOn');
    }
    else {
        $('#rad1').attr('class', 'radiodiv radioOn');
        $('#rad1 input').attr('class', 'radioOn');
    }


    $('#app-name').rebind('keyup', function(e) {
        $('.dev-new-app-big-icon').text($(this).val());
    });


    $('.reg-st5-complete-button.cancel').rebind('click', function(e) {
        document.location.hash = 'sdk';
    });

    $('.reg-st5-complete-button.save').rebind('click', function(e) {
        var status = 0;
        if ($('#rad2').hasClass('radioOn')) {
            status = 1;
        }
        loadingDialog.show();
        api_req({
            a: 'apu',
            'ah': sdk_app.key,
            'name': $('#app-name').val(),
            'site': $('#website').val(),
            'description': $('#appdesc').val(),
            'publisher': $('#publisher-name').val(),
            'status': status
        }, {
            callback: function() {
                loadingDialog.hide();
                document.location.hash = 'sdk';
            }
        });
    });


    $('.dev-new-button.del-icon').rebind('click', function(e) {
        msgDialog('confirmation',
            'Delete',
            'Are you sure you want to delete this App?',
            'The key for this app will become invalid',
            function(e) {
                if (e) {
                    loadingDialog.show();
                    api_req({
                        a: 'apd',
                        'ah': sdk_app.key
                    }, {
                        callback: function() {
                            loadingDialog.hide();
                            document.location.hash = 'sdk';
                        }
                    });
                }
            });
    });

    $('.new-right-content-block.app').removeClass('hidden');
    $('.main-scroll-block').jScrollPane({
        showArrows: true,
        arrowSize: 5,
        animateScroll: true,
        mouseWheelSpeed: 50
    });
}


function load_sdkkeys(cb) {
    api_req({
        a: 'apg'
    }, {
        cb: cb,
        callback: function(res, ctx) {
            if (typeof res === 'object') {
                sdk_keys = [];
                for (var key in res) {
                    if (res[key]) {
                        res[key]['key'] = key;
                        sdk_keys.push(res[key]);
                    }
                }
                if (ctx.cb) {
                    ctx.cb();
                }
            }
        }
    });
}


function sdk_key_render() {
    var $parent = $('.grid-table').parent();
    $('.grid-table').remove();
    var markup = '<table width="100%" border="0" cellspacing="0" cellpadding="0" class="grid-table">' +
        '<tr><th>App Name</th><th>Key</th><th>Status</th><th></th></tr>';

    for (var i in sdk_keys) {
        if (sdk_keys.hasOwnProperty(i)) {
            var status = 'Development';
            if (sdk_keys[i]['status'] > 0) {
                status = 'Operational';
            }
            markup += '<tr><td>' +
                '<span class="dev-new-table-icon">' + escapeHTML(sdk_keys[i]['name']) + '</span>' +
                '</td><td>' + escapeHTML(sdk_keys[i]['key']) + '</td><td>' + status + '</td><td>' +
                '<span class="dev-new-app-settings" id="' + escapeHTML(sdk_keys[i]['key']) + '"></span>' +
                '</td></tr>';
        }
    }
    markup += '</table>';
    $parent.safeAppend(markup);
    $('.dev-new-appplications-table.apps').removeClass('hidden');

    $('.dev-new-app-settings').rebind('click', function(e) {
            for (var i in sdk_keys) {
                if ($(this).attr('id') === sdk_keys[i]['key']) {
                    sdk_app = sdk_keys[i];
                }
            }
            document.location.hash = 'sdk_' + $(this).attr('id');
        });
    $('.main-scroll-block').jScrollPane({
            showArrows: true,
            arrowSize: 5,
            animateScroll: true,
            mouseWheelSpeed: 50
        });
}
