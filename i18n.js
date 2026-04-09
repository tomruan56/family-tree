/* ============================================================
   INTERNATIONALIZATION — English & Vietnamese
   ============================================================ */

(function () {
  const TRANSLATIONS = {

    en: {
      // App
      appTitle:             'Family Tree',
      // Header
      addPerson:            'Add Person',
      importBtn:            'Import',
      exportBtn:            'Export',
      // Empty state (inside a tree)
      emptyTitle:           'Start Your Family Tree',
      emptyDesc:            'Add your first family member to begin',
      addFirstPerson:       'Add First Person',
      // Welcome screen (no families yet)
      welcomeTitle:         'Welcome to Family Tree',
      welcomeDesc:          'Create your first family tree to get started',
      // Families modal
      families:             'My Families',
      createFamilyLabel:    'New Family',
      phFamilyName:         'e.g. The Nguyens…',
      btnCreate:            'Create',
      btnOpen:              'Open',
      btnRename:            'Rename',
      btnDelete:            'Delete',
      currentFamily:        'Current',
      noFamilies:           'No families yet.',
      renameFamilyPrompt:   'Enter new name:',
      toastFamilyCreated:   'Family tree created',
      toastFamilyRenamed:   'Renamed successfully',
      toastFamilyDeleted:   'Family tree deleted',
      toastFamilySwitched:  (name) => `Switched to "${name}"`,
      confirmDeleteFamily:  (name) => `Delete "${name}"?\nAll data in this family tree will be permanently lost.`,
      // Person modal
      addPersonTitle:       'Add Person',
      editPersonTitle:      'Edit Person',
      sectionBasic:         'Basic Information',
      firstName:            'First Name',
      lastName:             'Last Name',
      nickname:             'Nickname',
      gender:               'Gender',
      genderMale:           'Male',
      genderFemale:         'Female',
      genderOther:          'Other',
      genderUnknown:        'Unknown',
      sectionBirth:         'Birth',
      sectionDeath:         'Death',
      leaveBlankLiving:     'leave blank if living',
      sectionAdditional:    'Additional',
      labelDate:            'Date',
      labelPlace:           'Place',
      labelPhoto:           'Photo',
      labelPhotoUrl:        'Photo URL',
      uploadPhoto:          'Upload Photo',
      orLabel:              'or',
      toastUploadFailed:    'Upload failed',
      labelNotes:           'Notes',
      btnCancel:            'Cancel',
      btnSave:              'Save',
      // Placeholders
      phFirstName:          'First name',
      phLastName:           'Last name',
      phNickname:           'Nickname',
      phCity:               'City, Country',
      phPhotoUrl:           'https://example.com/photo.jpg',
      phNotes:              'Biography, occupation, interesting facts…',
      phSearchName:         'Type a name…',
      // Relation modal
      linkPrefix:           'Link:',
      relTypeParent:        'Parent',
      relTypeChild:         'Child',
      relTypeSpouse:        'Spouse',
      relTypeSibling:       'Sibling',
      searchPersonLabel:    'Search Person',
      noMatchingPeople:     'No matching people',
      createAndLink:        'Create New Person & Link',
      // Import modal
      importTitle:          'Import Data',
      importDesc:           'Upload a previously exported JSON file or paste JSON below.',
      uploadFile:           'Upload File',
      orPasteJson:          'Or Paste JSON',
      btnImport:            'Import',
      // Zoom controls
      zoomIn:               'Zoom In',
      zoomOut:              'Zoom Out',
      fitScreen:            'Fit to screen',
      // Sidebar
      sbDetails:            'Details',
      sbParents:            'Parents',
      sbSpouse:             'Spouse',
      sbSpouses:            'Spouses',
      sbChildren:           (n) => `Children (${n})`,
      sbSiblings:           (n) => `Siblings (${n})`,
      btnEdit:              'Edit',
      btnRelate:            'Relate',
      relLabelParent:       'Parent',
      relLabelChild:        'Child',
      relLabelSpouse:       'Spouse',
      relLabelSibling:      'Sibling',
      // Date abbreviations in tree nodes
      bornAbbr:             'Born.',
      diedAbbr:             'Died.',
      bornPrefix:           'Born',
      // Toast messages
      toastFirstNameReq:    'First name is required',
      toastSaved:           'Saved',
      toastPersonAdded:     'Person added',
      toastAddedLinked:     'Person added & linked',
      toastRelAdded:        'Relationship added',
      toastExported:        'Exported',
      toastImportedOk:      'Imported successfully',
      toastInvalidJson:     'Invalid JSON — check the file format',
      toastMaxParents:      'A person can have at most 2 parents',
      toast2Parents:        'That person already has 2 parents',
      toastNeedParents:     'At least one of them must already have parents defined',
      toastDeleted:         'Person deleted',
      toastRelDeleted:      'Relationship removed',
      // Confirm dialogs
      confirmDelete:        (name) => `Delete ${name}? All their relationships will also be removed.`,
      confirmUnlink:        (name) => `Remove relationship with ${name}?`,
      confirmImport:        'This will replace all data in the current family tree. Continue?',
      // Relation actions
      unlinkRel:            'Remove relationship',
      // Gender display
      displayGender:        (g) => ({ male: 'Male', female: 'Female', other: 'Other', unknown: '' }[g] || ''),
      dateLocale:           'en-US',
    },

    vi: {
      // App
      appTitle:             'Cây Gia Phả',
      // Header
      addPerson:            'Thêm Người',
      importBtn:            'Nhập',
      exportBtn:            'Xuất',
      // Empty state
      emptyTitle:           'Bắt Đầu Cây Gia Phả',
      emptyDesc:            'Thêm thành viên đầu tiên của gia đình để bắt đầu',
      addFirstPerson:       'Thêm Người Đầu Tiên',
      // Welcome screen
      welcomeTitle:         'Chào Mừng Đến Với Cây Gia Phả',
      welcomeDesc:          'Tạo cây gia phả đầu tiên của bạn để bắt đầu',
      // Families modal
      families:             'Gia Phả Của Tôi',
      createFamilyLabel:    'Tạo Mới',
      phFamilyName:         'vd. Nhà Nguyễn…',
      btnCreate:            'Tạo',
      btnOpen:              'Mở',
      btnRename:            'Đổi Tên',
      btnDelete:            'Xóa',
      currentFamily:        'Hiện tại',
      noFamilies:           'Chưa có gia phả nào.',
      renameFamilyPrompt:   'Nhập tên mới:',
      toastFamilyCreated:   'Đã tạo cây gia phả',
      toastFamilyRenamed:   'Đã đổi tên thành công',
      toastFamilyDeleted:   'Đã xóa cây gia phả',
      toastFamilySwitched:  (name) => `Đã chuyển sang "${name}"`,
      confirmDeleteFamily:  (name) => `Xóa "${name}"?\nTất cả dữ liệu trong cây gia phả này sẽ bị mất vĩnh viễn.`,
      // Person modal
      addPersonTitle:       'Thêm Người',
      editPersonTitle:      'Chỉnh Sửa Người',
      sectionBasic:         'Thông Tin Cơ Bản',
      firstName:            'Tên',
      lastName:             'Họ',
      nickname:             'Tên thường gọi',
      gender:               'Giới Tính',
      genderMale:           'Nam',
      genderFemale:         'Nữ',
      genderOther:          'Khác',
      genderUnknown:        'Không rõ',
      sectionBirth:         'Ngày Sinh',
      sectionDeath:         'Ngày Mất',
      leaveBlankLiving:     'để trống nếu còn sống',
      sectionAdditional:    'Thông Tin Thêm',
      labelDate:            'Ngày',
      labelPlace:           'Nơi',
      labelPhoto:           'Ảnh',
      labelPhotoUrl:        'Ảnh (URL)',
      uploadPhoto:          'Tải Ảnh Lên',
      orLabel:              'hoặc',
      toastUploadFailed:    'Tải ảnh thất bại',
      labelNotes:           'Ghi Chú',
      btnCancel:            'Hủy',
      btnSave:              'Lưu',
      // Placeholders
      phFirstName:          'Tên',
      phLastName:           'Họ',
      phNickname:           'Tên thường gọi',
      phCity:               'Thành phố, Quốc gia',
      phPhotoUrl:           'https://example.com/anh.jpg',
      phNotes:              'Tiểu sử, nghề nghiệp, thông tin thú vị…',
      phSearchName:         'Nhập tên…',
      // Relation modal
      linkPrefix:           'Kết nối:',
      relTypeParent:        'Cha/Mẹ',
      relTypeChild:         'Con',
      relTypeSpouse:        'Vợ/Chồng',
      relTypeSibling:       'Anh/Chị/Em',
      searchPersonLabel:    'Tìm Người',
      noMatchingPeople:     'Không tìm thấy người phù hợp',
      createAndLink:        'Tạo Người Mới & Liên Kết',
      // Import modal
      importTitle:          'Nhập Dữ Liệu',
      importDesc:           'Tải lên tệp JSON đã xuất trước đó hoặc dán JSON vào bên dưới.',
      uploadFile:           'Tải Tệp Lên',
      orPasteJson:          'Hoặc Dán JSON',
      btnImport:            'Nhập',
      // Zoom
      zoomIn:               'Phóng To',
      zoomOut:              'Thu Nhỏ',
      fitScreen:            'Vừa Màn Hình',
      // Sidebar
      sbDetails:            'Chi Tiết',
      sbParents:            'Cha Mẹ',
      sbSpouse:             'Vợ/Chồng',
      sbSpouses:            'Vợ/Chồng',
      sbChildren:           (n) => `Con Cái (${n})`,
      sbSiblings:           (n) => `Anh Chị Em (${n})`,
      btnEdit:              'Sửa',
      btnRelate:            'Quan hệ',
      relLabelParent:       'Cha/Mẹ',
      relLabelChild:        'Con',
      relLabelSpouse:       'Vợ/Chồng',
      relLabelSibling:      'Anh/Chị/Em',
      // Date abbreviations
      bornAbbr:             'Sinh.',
      diedAbbr:             'Mất.',
      bornPrefix:           'Tên khai sinh',
      // Toasts
      toastFirstNameReq:    'Tên là bắt buộc',
      toastSaved:           'Đã lưu',
      toastPersonAdded:     'Đã thêm người',
      toastAddedLinked:     'Đã thêm người & liên kết',
      toastRelAdded:        'Đã thêm quan hệ',
      toastExported:        'Đã xuất tệp',
      toastImportedOk:      'Nhập dữ liệu thành công',
      toastInvalidJson:     'JSON không hợp lệ — kiểm tra định dạng tệp',
      toastMaxParents:      'Mỗi người chỉ có tối đa 2 cha/mẹ',
      toast2Parents:        'Người này đã có 2 cha/mẹ',
      toastNeedParents:     'Ít nhất một người phải có cha/mẹ đã được xác định',
      toastDeleted:         'Đã xóa người',
      toastRelDeleted:      'Đã xóa quan hệ',
      // Confirm
      confirmDelete:        (name) => `Xóa ${name}? Tất cả các quan hệ của họ cũng sẽ bị xóa.`,
      confirmUnlink:        (name) => `Xóa quan hệ với ${name}?`,
      confirmImport:        'Thao tác này sẽ thay thế toàn bộ dữ liệu trong cây gia phả hiện tại. Tiếp tục?',
      // Relation actions
      unlinkRel:            'Xóa quan hệ',
      // Gender display
      displayGender:        (g) => ({ male: 'Nam', female: 'Nữ', other: 'Khác', unknown: '' }[g] || ''),
      dateLocale:           'vi-VN',
    },

  };

  const LANG_KEY = 'familytree_lang';

  window.i18n = {
    lang: localStorage.getItem(LANG_KEY) || 'vi',

    t(key, ...args) {
      const tr  = TRANSLATIONS[this.lang] || TRANSLATIONS.vi;
      const val = tr[key] !== undefined ? tr[key] : (TRANSLATIONS.vi[key] !== undefined ? TRANSLATIONS.vi[key] : key);
      return typeof val === 'function' ? val(...args) : val;
    },

    setLang(lang) {
      if (!TRANSLATIONS[lang]) return;
      this.lang = lang;
      localStorage.setItem(LANG_KEY, lang);
    },

    applyTranslations() {
      document.querySelectorAll('[data-i18n]').forEach(el => {
        el.textContent = this.t(el.dataset.i18n);
      });
      document.querySelectorAll('[data-i18n-ph]').forEach(el => {
        el.placeholder = this.t(el.dataset.i18nPh);
      });
      document.querySelectorAll('[data-i18n-title]').forEach(el => {
        el.title = this.t(el.dataset.i18nTitle);
      });
      document.title = this.t('appTitle');
      // Update both the header lang button and the ⋯ more-menu label
      const altLabel = this.lang === 'en' ? '🇻🇳 VI' : '🇺🇸 EN';
      const btn = document.getElementById('btn-lang');
      if (btn) btn.textContent = altLabel;
      const moreLang = document.getElementById('more-lang-label');
      if (moreLang) moreLang.textContent = altLabel;
    },
  };
})();
